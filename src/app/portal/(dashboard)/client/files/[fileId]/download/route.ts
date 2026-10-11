import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/portal/roles";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivityAsSystem } from "@/lib/admin/activityLog";

// Authorised download of a RELEASED assignment file. The client's Files list links here (never to storage).
// Access = the signed-in user can read the deliverable that was published from this file: row-level
// security allows exactly the project's own client (and staff) to read it, so a file that has not been
// released — or that belongs to someone else's project — is simply "not found". The storage object stays in
// the private bucket; the response is a 60-second signed link, and every access is audited.

const NOT_FOUND = () => new NextResponse("Not found", { status: 404 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  if (!UUID.test(fileId)) return NOT_FOUND();

  const user = await getCurrentUser();
  if (!user) {
    const login = new URL("/portal/login", request.url);
    return NextResponse.redirect(login);
  }

  const supabase = await createClient();
  const { data: deliverable } = await supabase.from("deliverables").select("id, entity_type, entity_id, title").eq("project_file_id", fileId).maybeSingle();
  if (!deliverable) return NOT_FOUND();

  const admin = createAdminClient();
  const { data: file } = await admin.from("project_files").select("storage_bucket, storage_path, original_filename, release_status, purged_at").eq("id", fileId).maybeSingle();
  if (!file || file.release_status !== "released" || file.purged_at) return NOT_FOUND();

  const asDownload = request.nextUrl.searchParams.get("download") === "1";
  const { data: signed, error } = await admin.storage.from(file.storage_bucket as string).createSignedUrl(file.storage_path as string, 60, asDownload ? { download: file.original_filename as string } : undefined);
  if (error || !signed) {
    console.error("[client-files] failed to sign a released file", error?.message);
    return new NextResponse("This file is temporarily unavailable.", { status: 503 });
  }

  await logActivityAsSystem({ actorUserId: user.id, action: "project_file.client_accessed", entityType: "enquiry", entityId: deliverable.entity_id as string, metadata: { fileId, title: deliverable.title, download: asDownload } });
  const response = NextResponse.redirect(signed.signedUrl, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
