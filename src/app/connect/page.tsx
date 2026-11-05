import type { Metadata } from "next";
import ConnectView from "./ConnectView";
import { getConnectGallery } from "@/lib/connectPortfolio/publicGallery";
import { BRAND_NAME, CONNECT_URL, TAGLINE } from "./connectConfig";

// https://ordiftstudios.com/connect: the page the ORDIFT STUDIOS QR code opens. Not for search results (noindex) and not in the sitemap (src/app/sitemap.ts lists its routes explicitly and
// does not include this one). The photographs are the 15 approved ones until the Super Admin QR portfolio manager publishes a list; the page then follows that list. If the list cannot be read it
// falls back safely (see src/lib/connectPortfolio/published.ts), so the card page never breaks.
export const metadata: Metadata = {
  title: `${BRAND_NAME} — Connect`,
  description: TAGLINE,
  robots: { index: false, follow: true },
  openGraph: { title: `${BRAND_NAME} — Connect`, description: TAGLINE, url: CONNECT_URL, siteName: BRAND_NAME, type: "website" },
};

// Rendered per request: the page is already served uncached (the session middleware sets no-store), and a page built ahead of time could freeze a temporary fallback into place.
export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const { images } = await getConnectGallery();
  return <ConnectView images={images} />;
}
