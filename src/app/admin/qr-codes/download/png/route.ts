import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { masterQrDownloadResponse } from "@/lib/qr/connectQr";

// Downloads the approved PNG master of the permanent QR code. Super Admin only: anyone else (signed out, or signed in without that role) gets a plain "not found", nothing else about it.
// There are no parameters: the file is fixed and nothing here can produce a code for a different address.
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return masterQrDownloadResponse("png");
}
