import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

// Approved 2026-07-23 (Plan/Brand Bible section 28): display/heading font.
// Editorial/cinematic serif. `ital` included for pull quotes and editorial
// statements (section 21's Quotes category) — no separate italic font needed.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  style: ["normal", "italic"],
});

// Approved 2026-07-23: body copy, navigation, buttons, forms, labels.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// No dedicated 1200x630 social-share image exists yet — using the gold
// full-lockup logo as a real, honest stopgap (not a placeholder/invented
// asset) rather than shipping with no image at all. Swap for a proper
// OG image whenever one's designed; nothing else needs to change.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ordiftstudios.com";
const SITE_DESCRIPTION =
  "Ordift Studios is a multidisciplinary creative house where photography, film, design, branding, content and talent work as one connected system.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // No template: every page under src/app/**/page.tsx already appends
  // "— Ordift Studios" to its own title via generateMetadata() (see
  // e.g. about/page.tsx) — a template here would double it up. `default`
  // only applies to the rare route with no title of its own at all.
  title: "Ordift Studios — A Multidisciplinary Creative House",
  description: SITE_DESCRIPTION,
  openGraph: {
    title: "Ordift Studios — A Multidisciplinary Creative House",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "Ordift Studios",
    images: [{ url: "/brand/logo-full-gold.png", width: 474, height: 524, alt: "Ordift Studios" }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Ordift Studios — A Multidisciplinary Creative House",
    description: SITE_DESCRIPTION,
    images: ["/brand/logo-full-gold.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
