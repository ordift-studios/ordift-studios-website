// Everything the QR landing page (/connect) says and links to, in one place. Pure: no imports, no network.
//
// Public brand name: ORDIFT STUDIOS, always in capitals on this page (management decision, 5 Nov 2026).
// The WhatsApp number below is approved for THIS page only. It is deliberately not shared with quotation documents, whose letterheads exclude it.
// Nothing here is guessed: a link that is not confirmed is simply absent (there is no TikTok entry, and no placeholder for one).

export const BRAND_NAME = "ORDIFT STUDIOS";
export const TAGLINE = "A multidisciplinary creative house.";

export const CONNECT_URL = "https://ordiftstudios.com/connect";
export const WEBSITE_URL = "https://ordiftstudios.com";

// Attribution without any analytics service: the website's own address carries where the visitor came from.
const UTM = "utm_source=qr&utm_medium=card&utm_campaign=connect";
export const WEBSITE_LINK = `${WEBSITE_URL}/?${UTM}`;
// Where "View Portfolio" goes if the gallery on this page ever has too few photographs: the website's own, already published, photography portfolio.
export const PORTFOLIO_FALLBACK_LINK = `${WEBSITE_URL}/work/photography?${UTM}`;

export const WHATSAPP = {
  number: "447777371023",                                           // wa.me format: digits only, with country code
  display: "+44 7777 371023",
  message: `Hello ${BRAND_NAME}, I’d like to enquire about your services.`,
} as const;
export const whatsappHref = (): string => `https://wa.me/${WHATSAPP.number}?text=${encodeURIComponent(WHATSAPP.message)}`;

// The visitor chooses the market explicitly; nothing here is selected from their location.
export const CALL_OPTIONS = [
  { market: "Qatar", display: "+974 5510 4490", tel: "+97455104490" },
  { market: "Ghana", display: "+233 504 981 277", tel: "+233504981277" },
] as const;
export const telHref = (tel: string): string => `tel:${tel}`;

export const EMAIL = { address: "enquiries@ordiftstudios.com", subject: `Enquiry via ${BRAND_NAME} QR code` } as const;
export const mailtoHref = (): string => `mailto:${EMAIL.address}?subject=${encodeURIComponent(EMAIL.subject)}`;

// Official accounts only, each confirmed to exist before it was added. Instagram: the profile page for @ordift_photographyyy resolves and shows the studio's name (checked 5 Nov 2026).
// TikTok is NOT listed: no URL has been confirmed.
export const SOCIAL_LINKS: readonly { label: string; href: string }[] = [
  { label: "Instagram", href: "https://www.instagram.com/ordift_photographyyy/" },
];

// The gallery on this page is a fixed set of photographs approved by management (see gallery.ts). With fewer than this many it is not shown (a sparse grid looks unfinished) and View Portfolio
// opens the website's portfolio instead.
export const GALLERY_MIN_IMAGES = 4;
