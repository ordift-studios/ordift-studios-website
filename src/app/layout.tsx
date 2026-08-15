import type { Metadata } from "next";
import { Suspense } from "react";
import { Fraunces, Inter } from "next/font/google";
import { contentRepository } from "@/lib/content";
import NavigationProgressBar from "@/components/NavigationProgressBar";
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
    // Image intentionally omitted here — the opengraph-image.tsx/
    // twitter-image.tsx file conventions in this same route segment
    // generate the default share image. A more specific page (e.g. the
    // portfolio case study) still wins with its own explicit images.
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ordift Studios — A Multidisciplinary Creative House",
    description: SITE_DESCRIPTION,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const siteSettings = await contentRepository.getSiteSettings();
  const logoUrl = siteSettings.logoUrl
    ? new URL(siteSettings.logoUrl, SITE_URL).toString()
    : new URL("/brand/logo-full-gold.png", SITE_URL).toString();

  // Sourced entirely from real SiteSettings data — never a hardcoded
  // street address, founding date, or social profile that doesn't
  // actually exist. sameAs is omitted whenever socialLinks is empty
  // rather than guessed at.
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteSettings.siteName,
    url: SITE_URL,
    logo: logoUrl,
    description: SITE_DESCRIPTION,
    ...(siteSettings.socialLinks.length > 0
      ? { sameAs: siteSettings.socialLinks.map((link) => link.url) }
      : {}),
  };
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteSettings.siteName,
    url: SITE_URL,
  };

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <Suspense fallback={null}>
          <NavigationProgressBar />
        </Suspense>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
