import { CONNECT_QR_MASTER } from "./connectQrMaster.generated";

// The permanent ORDIFT STUDIOS digital-business-card QR code, as served by the Super Admin QR Code Manager.
//
// FIXED BY DESIGN: there is exactly one code and its address is a constant. Nothing here accepts a destination, builds a code, or reads settings, the environment or the request; the files are the
// approved masters from brand/qr/ (embedded at build time), served byte for byte. The code points to the page address, not to the portfolio or the contact details, so it stays valid when those change.

export const CONNECT_QR_DESTINATION: string = CONNECT_QR_MASTER.destination;

export const MASTER_QR_FORMATS = ["png", "svg"] as const;
export type MasterQrFormat = (typeof MASTER_QR_FORMATS)[number];

export type MasterQrFile = { format: MasterQrFormat; filename: string; contentType: string; body: Uint8Array; bytes: number; sha256: string };

const files: Record<MasterQrFormat, MasterQrFile> = (() => {
  const png = new Uint8Array(Buffer.from(CONNECT_QR_MASTER.png.base64, "base64"));
  const svg = new Uint8Array(Buffer.from(CONNECT_QR_MASTER.svg.text, "utf8"));
  return {
    png: { format: "png", filename: CONNECT_QR_MASTER.png.filename, contentType: "image/png", body: png, bytes: png.length, sha256: CONNECT_QR_MASTER.png.sha256 },
    svg: { format: "svg", filename: CONNECT_QR_MASTER.svg.filename, contentType: "image/svg+xml; charset=utf-8", body: svg, bytes: svg.length, sha256: CONNECT_QR_MASTER.svg.sha256 },
  };
})();

export const getMasterQrFile = (format: MasterQrFormat): MasterQrFile => files[format];

export const MASTER_QR_DETAILS = {
  png: { width: CONNECT_QR_MASTER.png.width, height: CONNECT_QR_MASTER.png.height, bitDepth: CONNECT_QR_MASTER.png.bitDepth },
  symbolModules: 33, quietZoneModules: 4, version: 4, errorCorrection: "H",
} as const;

// A data: address for showing the vector master on the Super Admin page (the content security policy already allows data: images). It is built from the embedded SVG, not from any input.
export const previewDataUri = (): string => `data:image/svg+xml;base64,${Buffer.from(CONNECT_QR_MASTER.svg.text, "utf8").toString("base64")}`;

// The download response. Only ever called for a Super Admin (each route checks first). An attachment, never cached by anyone, never indexed.
export function masterQrDownloadResponse(format: MasterQrFormat): Response {
  const f = getMasterQrFile(format);
  return new Response(f.body as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": f.contentType,
      "Content-Disposition": `attachment; filename="${f.filename}"`,
      "Content-Length": String(f.bytes),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
