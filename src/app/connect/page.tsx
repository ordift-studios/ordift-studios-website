import type { Metadata } from "next";
import ConnectView from "./ConnectView";
import { getConnectGalleryImages } from "./gallery";
import { BRAND_NAME, CONNECT_URL, TAGLINE } from "./connectConfig";

// https://ordiftstudios.com/connect: the page the ORDIFT STUDIOS QR code opens. Not for search results (noindex) and not in the sitemap (src/app/sitemap.ts lists its routes explicitly and
// does not include this one). The gallery is a fixed set of approved, pre-optimised photographs, so the page reads no CMS content of its own.
export const metadata: Metadata = {
  title: `${BRAND_NAME} — Connect`,
  description: TAGLINE,
  robots: { index: false, follow: true },
  openGraph: { title: `${BRAND_NAME} — Connect`, description: TAGLINE, url: CONNECT_URL, siteName: BRAND_NAME, type: "website" },
};

export default function ConnectPage() {
  return <ConnectView images={getConnectGalleryImages()} />;
}
