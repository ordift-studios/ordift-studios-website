import { TalentMediaItemControls } from "./TalentMediaItemControls";

// Talent Media Upload + View (2026-09-09); Remove + Replace
// (2026-09-09). Stays a plain server component — only the interactive
// Remove/Replace controls per item are a client component
// (TalentMediaItemControls.tsx); the gallery grid/image/video display
// itself needs no client-side state. `viewUrl` is always a
// short-lived (5 minute), authorized signed URL resolved server-side
// in page.tsx via getTalentMediaDownloadUrl() — this component never
// receives or renders a raw bucket name or storage path; if a signed
// URL couldn't be generated for a given asset, it's simply omitted
// from `assets` upstream rather than falling back to anything
// unauthorized.
export type TalentMediaGalleryItem = {
  id: string;
  mediaType: string;
  caption: string | null;
  viewUrl: string;
};

export function TalentMediaGallery({ profileId, assets }: { profileId: string; assets: TalentMediaGalleryItem[] }) {
  if (assets.length === 0) {
    return <p className="font-sans text-body-small text-ordift-ink-muted italic">No media uploaded yet.</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {assets.map((asset) => (
        <div key={asset.id} className="space-y-1">
          <div className="aspect-square rounded-lg overflow-hidden bg-black/5 border border-black/10">
            {asset.mediaType === "portfolio_video" ? (
              <video src={asset.viewUrl} controls className="w-full h-full object-cover" />
            ) : (
              // Signed URL, short-lived, never a static/public asset —
              // next/image's remote-pattern allowlist isn't a fit for a
              // URL that expires and changes on every render; a plain
              // <img> is the correct choice here, same pattern already
              // accepted (unsuppressed) for dynamic asset previews in
              // PortfolioProjectForm.tsx.
              <img src={asset.viewUrl} alt={asset.caption ?? "Talent media"} className="w-full h-full object-cover" />
            )}
          </div>
          <p className="font-sans text-caption text-ordift-ink-muted truncate">{asset.caption ?? asset.mediaType}</p>
          <TalentMediaItemControls assetId={asset.id} profileId={profileId} mediaType={asset.mediaType} caption={asset.caption} />
        </div>
      ))}
    </div>
  );
}
