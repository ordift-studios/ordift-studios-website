// Reusable across every content type with a public-facing page (today:
// Portfolio; future: Journal, Services, About/Team, etc. once those get
// native admin editing surfaces — see src/app/admin/content/page.tsx).
// Opens the real production route in a new tab using the admin's own
// session, which already bypasses the LAUNCH_HOLDING_PAGE gate (see
// src/proxy.ts) — no separate preview URL, no extra login.
export default function PreviewOnLiveSiteButton({ publicPath }: { publicPath: string }) {
  return (
    <a
      href={publicPath}
      target="_blank"
      rel="noopener noreferrer"
      className="font-sans text-body-small font-medium px-4 py-2 rounded-md border border-black/15 text-ordift-ink whitespace-nowrap"
    >
      Preview on Live Site →
    </a>
  );
}
