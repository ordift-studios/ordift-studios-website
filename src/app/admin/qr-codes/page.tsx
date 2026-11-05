import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { CONNECT_QR_DESTINATION, MASTER_QR_DETAILS, getMasterQrFile, previewDataUri } from "@/lib/qr/connectQr";
import Link from "next/link";
import CopyUrlButton from "./CopyUrlButton";

export const metadata: Metadata = { title: "Digital Business Card (QR code) — Ordift Studios Admin", robots: { index: false, follow: false } };

const gold = "inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-ordift-gold px-5 font-sans text-body-small font-medium text-ordift-navy-950 hover:bg-ordift-gold-hover sm:flex-none";
const outline = "inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-black/20 px-5 font-sans text-body-small font-medium text-ordift-ink hover:bg-black/5 sm:flex-none";
const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

// Super Admin only. The page, and each of its two downloads, check the signed-in user themselves; the menu link is only a convenience and is never the security boundary.
// The QR code shown here is fixed: nothing on this page can create a code, change its address or send it anywhere. It is the approved master from brand/qr/, served as is.
export default async function QrCodesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login?next=/admin/qr-codes");
  if (!isSuperAdmin(user)) notFound();

  const png = getMasterQrFile("png");
  const svg = getMasterQrFile("svg");

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">Digital Business Card (QR code)</h1>
        <p className="mt-2 font-sans text-body-small text-ordift-ink-muted">The permanent QR code for the ORDIFT STUDIOS digital business card. Download it for printing or sharing. Visitors who scan it land on the card page.</p>
      </div>

      <section aria-labelledby="qr-preview-title" className="rounded-xl border border-black/10 bg-white p-5 sm:p-6">
        <h2 id="qr-preview-title" className="sr-only">The QR code</h2>
        <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
          <figure className="mx-auto w-full max-w-[17rem] sm:mx-0">
            {/* The approved vector master, shown on white exactly as it prints. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- an embedded SVG data: image; there is nothing for next/image to optimise */}
            <img src={previewDataUri()} alt={`QR code that opens ${CONNECT_QR_DESTINATION}`} width={272} height={272} className="block h-auto w-full rounded-lg border border-black/10 bg-white [image-rendering:crisp-edges]" />
            <figcaption className="mt-2 text-center font-sans text-caption text-ordift-ink-muted">Black on white, with its quiet zone</figcaption>
          </figure>

          <div className="space-y-5">
            <div>
              <p className="font-sans text-caption text-ordift-ink-muted">This code opens</p>
              <p className="mt-1 break-all rounded-lg bg-ordift-offwhite px-3 py-2 font-mono text-body-small text-ordift-ink select-all" data-testid="qr-destination">{CONNECT_QR_DESTINATION}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <CopyUrlButton url={CONNECT_QR_DESTINATION} className={outline} />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <a href="/admin/qr-codes/download/png" className={gold} aria-describedby="qr-png-note">Download PNG</a>
              <a href="/admin/qr-codes/download/svg" className={outline} aria-describedby="qr-svg-note">Download SVG</a>
            </div>
            <ul className="space-y-1 font-sans text-caption text-ordift-ink-muted">
              <li id="qr-png-note"><strong className="font-medium text-ordift-ink">PNG</strong>: {MASTER_QR_DETAILS.png.width} × {MASTER_QR_DETAILS.png.height} px, black and white, {kb(png.bytes)}. For documents, screens and sharing.</li>
              <li id="qr-svg-note"><strong className="font-medium text-ordift-ink">SVG</strong>: vector, scales to any size, {kb(svg.bytes)}. For professional printing.</li>
            </ul>
          </div>
        </div>
      </section>

      <section aria-labelledby="qr-portfolio-title" className="rounded-xl border border-black/10 bg-white p-5">
        <h2 id="qr-portfolio-title" className="font-sans text-body font-medium text-ordift-ink">Photographs on the card page</h2>
        <p className="mt-2 font-sans text-body-small text-ordift-ink-muted">Add, replace, reorder, hide or remove the photographs visitors see after scanning the code, and publish the changes without a website update. The QR code does not change.</p>
        <Link href="/admin/qr-codes/portfolio" className={`${outline} mt-3`}>Manage the QR portfolio</Link>
      </section>

      <section aria-labelledby="qr-permanent-title" className="rounded-xl border border-ordift-gold/50 bg-ordift-gold/10 p-5">
        <h2 id="qr-permanent-title" className="font-sans text-body font-medium text-ordift-ink">This QR code never changes</h2>
        <p className="mt-2 font-sans text-body-small text-ordift-ink">
          The code points to the card page&rsquo;s address, not to the photographs or the contact details. When you update the portfolio, replace photographs, change the design, or change the phone numbers,
          email, WhatsApp or Instagram link, <strong>the QR code stays exactly the same</strong>, so cards and materials that are already printed keep working and show the latest version of the page.
        </p>
        <p className="mt-2 font-sans text-body-small text-ordift-ink">
          The address is fixed and cannot be edited here. The code would only need replacing if the address <span className="font-mono">/connect</span> itself were ever moved, which is not intended.
        </p>
      </section>

      <section aria-labelledby="qr-print-title" className="rounded-xl border border-black/10 p-5">
        <h2 id="qr-print-title" className="font-sans text-body font-medium text-ordift-ink">Before you print</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 font-sans text-body-small text-ordift-ink">
          <li>Print the square code about 20&ndash;25&nbsp;mm wide on a business card (15&nbsp;mm at the very least).</li>
          <li>Keep the white margin around it clear. Keep it black on white; do not recolour, stretch or place a logo over it.</li>
          <li>Always scan a printed proof with real phones before a print run.</li>
        </ul>
        <details className="mt-3">
          <summary className="flex min-h-11 cursor-pointer items-center font-sans text-caption text-ordift-ink-muted">Technical details</summary>
          <dl className="mt-2 grid gap-x-4 gap-y-1 font-sans text-caption text-ordift-ink-muted sm:grid-cols-[auto_1fr]">
            <dt>Code</dt><dd>Version {MASTER_QR_DETAILS.version} ({MASTER_QR_DETAILS.symbolModules}&times;{MASTER_QR_DETAILS.symbolModules} modules), error correction {MASTER_QR_DETAILS.errorCorrection}, {MASTER_QR_DETAILS.quietZoneModules}-module quiet zone</dd>
            <dt>PNG SHA-256</dt><dd className="break-all font-mono">{png.sha256}</dd>
            <dt>SVG SHA-256</dt><dd className="break-all font-mono">{svg.sha256}</dd>
            <dt>Source</dt><dd>Approved master files in <span className="font-mono">brand/qr/</span></dd>
          </dl>
        </details>
      </section>
    </div>
  );
}
