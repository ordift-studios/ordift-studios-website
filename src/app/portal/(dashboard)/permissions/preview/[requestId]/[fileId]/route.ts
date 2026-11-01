import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/portal/roles";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PORTFOLIO_LIBRARY_ENABLED } from "@/lib/portfolio/featureGate";
import { PERMISSION_TEXT_APPROVED } from "@/lib/portfolio/permissionText";

// Shows a client ONE photograph named in an open permission request addressed to them, so they can see what they are being asked about. Nothing else is reachable here: the request must be
// theirs (row-level security), open, and name this exact photograph, which must be released to them. The file stays in the private bucket; the response is a 60-second signed link. Off until
// the library is on AND the wording is approved.
const NOT_FOUND = () => new NextResponse("Not found", { status: 404 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ requestId: string; fileId: string }> }) {
  const { requestId, fileId } = await params;
  if (!PORTFOLIO_LIBRARY_ENABLED || !PERMISSION_TEXT_APPROVED || !UUID.test(requestId) || !UUID.test(fileId)) return NOT_FOUND();
  const user = await getCurrentUser(); if (!user) return NOT_FOUND();
  const { data: req } = await (await createClient()).from("marketing_permission_requests").select("id, status, addressed_to, file_ids").eq("id", requestId).maybeSingle();
  if (!req || req.status !== "open" || req.addressed_to !== user.id || !((req.file_ids as string[] | null) ?? []).includes(fileId)) return NOT_FOUND();
  const admin = createAdminClient();
  const { data: file } = await admin.from("project_files").select("storage_bucket, storage_path, release_status, purged_at").eq("id", fileId).maybeSingle();
  if (!file || file.purged_at || file.release_status !== "released") return NOT_FOUND();
  const { data: signed } = await admin.storage.from(file.storage_bucket as string).createSignedUrl(file.storage_path as string, 60);
  if (!signed) return new NextResponse("This photograph is temporarily unavailable.", { status: 503 });
  const response = NextResponse.redirect(signed.signedUrl, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
