import { client } from "@/sanity/lib/client";

// Server-only Sanity asset upload — called exclusively from
// src/app/api/admin/portfolio/assets/route.ts, which is the only place
// a browser ever reaches this code path, and only after that route's
// own session + capability check passes. SANITY_API_TOKEN (carried by
// `client`) never leaves the server; the browser only ever receives the
// resulting asset id + a public CDN preview URL back from the route.

export type UploadedAsset = {
  assetId: string;
  url: string;
  width: number | null;
  height: number | null;
};

export async function uploadPortfolioImage(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<UploadedAsset> {
  const asset = await client.assets.upload("image", buffer, { filename, contentType });
  return {
    assetId: asset._id,
    url: asset.url,
    width: asset.metadata?.dimensions?.width ?? null,
    height: asset.metadata?.dimensions?.height ?? null,
  };
}

export async function uploadPortfolioFile(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<UploadedAsset> {
  const asset = await client.assets.upload("file", buffer, { filename, contentType });
  return { assetId: asset._id, url: asset.url, width: null, height: null };
}
