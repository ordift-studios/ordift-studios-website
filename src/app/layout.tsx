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

export const metadata: Metadata = {
  title: "Ordift Studios",
  description: "Ordift Studios — a multidisciplinary creative house.",
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
