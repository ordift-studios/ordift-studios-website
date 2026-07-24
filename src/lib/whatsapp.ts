// Pure WhatsApp link/formatting helpers — the number itself now comes
// from SiteSettings (contentRepository.getSiteSettings(), Version 1.2.6)
// rather than being read from an env var here. Superseded
// src/lib/siteSettings.ts, which read NEXT_PUBLIC_WHATSAPP_NUMBER
// directly; kept as pure functions so they have no opinion on where the
// number comes from.

const DEFAULT_MESSAGE = "Hello Ordift Studios, I would like to enquire about a project.";

export function whatsAppLink(whatsappNumber: string, message: string = DEFAULT_MESSAGE): string {
  const digitsOnly = whatsappNumber.replace(/[^0-9]/g, "");
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
}

export function formattedWhatsAppNumber(whatsappNumber: string): string {
  const digitsOnly = whatsappNumber.replace(/[^0-9]/g, "");
  // Display as "+<country> <rest>" — a light format, not locale-perfect,
  // just readable. e.g. 447777371023 -> +44 7777371023
  return `+${digitsOnly.slice(0, 2)} ${digitsOnly.slice(2)}`;
}
