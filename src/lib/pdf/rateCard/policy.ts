// The Founder's quotation / payment CURRENCY POLICY. Until it is approved, a rate card in any currency other than USD stays "proposed / indicative" and can never be approved for clients,
// so it cannot silently disagree with a quotation or payment amount (those are USD-only today). Only the Founder changes this value, in a reviewed commit, together with the policy itself.
export const CURRENCY_POLICY = { clientPublicationOfConvertedPricesApproved: false } as const;
