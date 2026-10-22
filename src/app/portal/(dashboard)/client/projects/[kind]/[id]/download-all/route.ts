import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/portal/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivityAsSystem } from "@/lib/admin/activityLog";
import { getReleasedContext } from "@/lib/portal/clientDeliveryData";
import { archiveFileName } from "@/lib/portal/clientDelivery";
import { safeEntryName, uniqueEntryNames, ZIP_MAX_BYTES, ZIP_MAX_ENTRIES, zipStream, type ZipEntry } from "@/lib/shared/zipStream";

// "Download all": ONE on-demand ZIP of the client's released photographs, streamed straight from storage to the browser.
// - Access = the signed-in client's OWN project (owner check + row-level security); only RELEASED, published, non-purged files.
// - The image bytes are copied exactly as stored (ZIP "store" method): no compression, no re-encoding, original quality.
// - Nothing is written anywhere: no temporary file and no persistent ZIP. Memory use is one network chunk at a time.
// - Storage links are signed server-side for a few minutes and never reach the browser. Every request is audited.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const plain = (status: number, message: string) => new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (kind !== "enquiry" || !UUID.test(id)) return plain(404, "Not found");

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/portal/login", request.url));

  const ctx = await getReleasedContext(id, user.id);
  if (!ctx) return plain(404, "Not found");
  if (ctx.files.length === 0) return plain(404, "There are no released photographs to download yet.");

  const total = ctx.files.reduce((n, f) => n + f.sizeBytes, 0);
  if (ctx.files.length > ZIP_MAX_ENTRIES || total > ZIP_MAX_BYTES) {
    return plain(413, "This delivery is too large for a single download. Please use the individual Download buttons.");
  }

  // Sign every file up front so a storage problem is reported BEFORE the download starts, not halfway through it.
  const admin = createAdminClient();
  const signed: { url: string }[] = [];
  for (const f of ctx.files) {
    const { data, error } = await admin.storage.from(f.bucket).createSignedUrl(f.path, 600);
    if (error || !data?.signedUrl) {
      console.error("[client-files] could not sign a file for the bulk download", error?.message);
      return plain(503, "We couldn't prepare your download just now. Please try again in a moment, or use the individual Download buttons.");
    }
    signed.push({ url: data.signedUrl });
  }

  // Folder per category; the client-facing title plus the original file extension; duplicates never overwrite each other.
  const names = uniqueEntryNames(
    ctx.files.map((f, i) => {
      const ext = /\.[A-Za-z0-9]{1,6}$/.exec(f.filename)?.[0] ?? "";
      const base = safeEntryName(f.title, `photograph-${i + 1}`);
      const file = base.toLowerCase().endsWith(ext.toLowerCase()) && ext ? base : `${base}${ext}`;
      return `${safeEntryName(f.categoryLabel, "Photographs")}/${file}`;
    })
  );
  const entries: ZipEntry[] = ctx.files.map((f, i) => ({
    name: names[i],
    modifiedAt: new Date(f.publishedAt),
    open: async () => {
      const res = await fetch(signed[i].url);
      if (!res.ok || !res.body) throw new Error(`storage returned ${res.status}`);
      return res.body as unknown as AsyncIterable<Uint8Array>;
    },
  }));

  await logActivityAsSystem({
    actorUserId: user.id,
    action: "project_file.client_bulk_downloaded",
    entityType: "enquiry",
    entityId: ctx.enquiryId,
    metadata: { fileCount: ctx.files.length, totalBytes: total },
  });

  const filename = archiveFileName(ctx.reference);
  return new Response(zipStream(entries), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
