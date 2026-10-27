// SERVER-ONLY: stores a rate card cover photograph as a Sanity image asset and fetches one back for the signed-in Super Admin's browser. Called only from the cover route, after its own role check.
// A Sanity asset address contains the file's content hash, so a replaced photograph is a NEW address — an approved edition keeps pointing at exactly the photograph that was approved.
import { editorialClient } from "@/sanity/lib/client";
import { isSanityCoverUrl, sanityCoverScope } from "./cover";

export type UploadedCover = { assetId: string; url: string; width: number | null; height: number | null };

export async function uploadCoverPhoto(buffer: Buffer, filename: string, contentType: string): Promise<UploadedCover> {
  const asset = await editorialClient.assets.upload("image", buffer, { filename, contentType });
  return { assetId: asset._id, url: asset.url, width: asset.metadata?.dimensions?.width ?? null, height: asset.metadata?.dimensions?.height ?? null };
}

// The route fetches ONLY an address that matches the cover pattern AND this deployment's own Sanity project and dataset — never an arbitrary URL.
export function isOwnCoverUrl(url: string, env: { projectId?: string; dataset?: string }): boolean {
  if (!isSanityCoverUrl(url)) return false;
  const scope = sanityCoverScope(url);
  return !!scope && !!env.projectId && !!env.dataset && scope.projectId === env.projectId && scope.dataset === env.dataset;
}
