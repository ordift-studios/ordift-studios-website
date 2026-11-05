import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageConnectPortfolio } from "@/lib/connectPortfolio/permissions";
import { recordAudit } from "@/lib/connectPortfolio/audit";
import { getStore } from "@/lib/connectPortfolio/defaultStore";
import { ALLOWED_UPLOAD_TYPES, DOC_ID, LIMITS, uploadProblem } from "@/lib/connectPortfolio/model";
import { ContentServiceError } from "@/lib/connectPortfolio/store";
import { checkUploadLimit } from "@/lib/connectPortfolio/uploadLimit";
import { MetadataStripError, stripImageMetadata, type StripFormat } from "@/lib/media/stripImageMetadata";
import { detectFileMimeType } from "@/lib/shared/fileContentSniff";

// Photograph upload for the Super Admin QR portfolio manager. The one place a browser sends image bytes. It stores the file as an ordinary image asset and returns its id and size; it does NOT add
// anything to the portfolio (that is a separate, checked step), so an upload on its own changes nothing visitors can see. The content-service token never leaves the server, and there is no
// destination, path or URL parameter: a request can only say "store this image".
//
// Vercel rejects request bodies over about 4.5 MB before this code runs; the browser shrinks photographs first (src/lib/media/qrPortfolioImagePrep.ts) so real uploads stay under that. MAX_UPLOAD_BYTES is
// the application's own ceiling, a safety net for a client that skips the shrinking.
const allowed = new Set<string>(ALLOWED_UPLOAD_TYPES);
const reject = (status: number, error: string, message: string) => NextResponse.json({ ok: false, error, message }, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageConnectPortfolio(user)) return reject(403, "unauthorized", "Not authorized.");

  // Counted before anything is read, so refused uploads count too. 20 in any 10 minutes is room for a full batch; see uploadLimit.ts.
  const limit = await checkUploadLimit(user.id);
  if (!limit.allowed) {
    const wait = limit.retryAfterSeconds ?? 60;
    const res = reject(429, "rate-limited", `Too many uploads in a short time. You can upload again in ${wait < 90 ? `${wait} seconds` : `${Math.ceil(wait / 60)} minutes`}.`);
    res.headers.set("Retry-After", String(wait));
    return res;
  }

  if (Number(request.headers.get("content-length") ?? "0") > LIMITS.MAX_UPLOAD_BYTES) return reject(413, "file-too-large", "That file is larger than 8 MB.");

  let formData: FormData;
  try { formData = await request.formData(); } catch { return reject(400, "invalid-form-data", "The upload could not be read."); }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return reject(400, "missing-file", "Choose a photograph to upload.");
  if (file.size > LIMITS.MAX_UPLOAD_BYTES) return reject(413, "file-too-large", "That file is larger than 8 MB.");
  if (!allowed.has(file.type)) return reject(415, "unsupported-file-type", "Only JPEG, PNG and WebP photographs can be uploaded.");

  const bytes = Buffer.from(await file.arrayBuffer());
  // The file's own bytes must say the same thing as its label: a renamed document or script is refused here, whatever it claims to be.
  const sniffed = await detectFileMimeType(bytes);
  if (!sniffed || !allowed.has(sniffed) || sniffed !== file.type) return reject(415, "unsupported-file-type", "That file is not a genuine JPEG, PNG or WebP photograph.");

  // Camera, date and GPS location details are removed from EVERY photograph, whether or not it needed resizing, before it leaves this server. The picture data is copied untouched (no quality loss); a
  // rotation is kept as the only tag. A file that cannot be parsed completely is refused, never stored as it came.
  let clean;
  try { clean = stripImageMetadata(bytes, sniffed as StripFormat); }
  catch (e) { if (e instanceof MetadataStripError) return reject(415, "unprocessable-image", e.userMessage); throw e; }

  try {
    const asset = await getStore().uploadImage({ bytes: clean.bytes, filename: file.name.replace(/[\u0000-\u001f/\\]/g, "").slice(0, 200) || "photograph", contentType: file.type });
    // Checked after the content service has read the image, because only it reports the true pixel size. A photograph that is too small or too large is simply not offered for adding.
    const problem = uploadProblem({ ...asset, filename: null });
    if (problem) return reject(422, "image-rejected", problem);
    await recordAudit({ actorUserId: user.id, action: "qr_portfolio.photo_uploaded", entityId: DOC_ID, metadata: { assetId: asset.assetId, bytes: file.size, storedBytes: clean.bytes.length, metadataRemovedBytes: clean.removedBytes, hadLocation: clean.hadLocation, contentType: file.type, width: asset.width, height: asset.height } });
    return NextResponse.json({ ok: true, assetId: asset.assetId, url: asset.url, width: asset.width, height: asset.height, color: asset.color, filename: file.name.slice(0, 200), metadataRemoved: true, hadLocation: clean.hadLocation }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[admin] qr portfolio upload failed", e instanceof Error ? e.message : e);
    return e instanceof ContentServiceError ? reject(502, "upload-failed", "The content service did not accept the upload. Nothing was added. Try again in a moment.") : reject(500, "upload-failed", "The upload failed. Nothing was added.");
  }
}
