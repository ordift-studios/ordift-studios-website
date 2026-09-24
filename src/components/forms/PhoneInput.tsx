"use client";

import { useMemo } from "react";
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

// Shared international phone/WhatsApp input (2026-09-24) — Founder QA:
// the Workshop Registration form's country-code field was a freeform
// text box with a "+974" placeholder, silently assuming Qatar (or
// requiring the visitor to already know and type their own dial code
// correctly). Audited the codebase first: no shared phone/country
// component existed anywhere (grep-confirmed), and no country/dial-code
// dataset was already a project dependency — every phone field
// (Workshop Registration, Booking, Careers application, staff profile
// edit) was a single freehand text input. This is the one governed
// implementation every one of those should reuse instead of maintaining
// separate, inconsistent country-code behaviour.
//
// Country/dial-code data comes from libphonenumber-js (MIT-licensed,
// no network calls, no recurring cost, actively maintained — the
// standard choice for this exact problem, not a handwritten list).
// Country display names come from the browser/Node's own
// Intl.DisplayNames — always current, zero maintenance, no second
// dataset to keep in sync with libphonenumber-js's ISO codes.
//
// Deliberately a native <select> for the country, not a custom
// popover/combobox: a native select is unconditionally keyboard-
// accessible, supports type-ahead search out of the box, and renders
// through each platform's own accessible picker UI (iOS wheel, Android
// modal list, desktop dropdown) — satisfying "tappable/clickable,
// accessible, searchable, works on mobile/iPad/Safari" with the
// platform's own tested implementation rather than a hand-built one.
//
// Emits BOTH the raw pieces (countryCode, callingCode, nationalNumber)
// and a best-effort E.164 string — callers store whichever shape their
// existing backend contract expects (see this component's own call
// sites for the two patterns: a table with a separate country-code
// column keeps the pieces; a single "phone" column stores the E.164
// string). This component itself never talks to a database, so it can
// never rewrite an existing stored value — normalization only ever
// happens for what the visitor types into a page using it.
//
// Compact closed-state correction (2026-09-25) — Founder iPad/mobile
// QA: showing the full country name ("Ghana +233") in the closed
// selector left too little width for the national-number field. A
// plain native <select> always renders its CURRENTLY SELECTED
// <option>'s own text in the closed box — there is no way to show
// different text closed vs. open with option text alone, since the OS
// renders the open dropdown from those same <option> labels. Fixed by
// keeping the real, full-size, fully-interactive native <select>
// (options still read "Ghana +233" — full names when opened, and to
// assistive tech) but making it visually transparent and layering a
// compact custom label on top, sized to content rather than a fixed
// wide column. The select still receives every click/tap/keystroke
// (the label is pointer-events-none) — this is a presentation-only
// change, not a new interaction model.
//
// Unified-field correction (2026-09-25, second pass) — Founder QA:
// the calling code + national number still read as two visibly
// separate boxes, and an earlier iteration's closed-state alpha-3 code
// ("GHA +233") was reverted — the closed selector shows the calling
// code alone ("+233") now, matching the Founder's exact spec. One
// outer bordered container now IS the field (rounded/border/bg/focus
// ring live here); the select and the national-number input each lost
// their own border/background/focus-ring, separated only by a thin
// inset divider, so the whole thing reads as one continuous control
// with the compact code+chevron on the left and the number input
// getting the overwhelming majority of the width. Width of the code
// area is content-sized (no fixed rem value) so it stays correct for
// a 1-digit code ("+1") or a longer one, never hard-coded to Ghana's
// length.

export type PhoneInputChange = {
  countryCode: CountryCode;
  callingCode: string;
  nationalNumber: string;
  /** Best-effort E.164 (e.g. "+233241234567") once the number looks complete; null while incomplete/unparseable — never a guess. */
  e164: string | null;
  isValid: boolean;
};

const ALL_COUNTRIES = getCountries();

let regionNames: Intl.DisplayNames | null = null;
function countryName(code: CountryCode): string {
  if (typeof Intl === "undefined" || typeof Intl.DisplayNames === "undefined") return code;
  regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
  return regionNames.of(code) ?? code;
}

const COUNTRY_OPTIONS = ALL_COUNTRIES.map((code) => ({
  code,
  name: countryName(code),
  callingCode: `+${getCountryCallingCode(code)}`,
})).sort((a, b) => a.name.localeCompare(b.name));

// Small caret — an inline SVG (not a Unicode "▾") for consistent size/
// weight across platforms; aria-hidden because the real <select>
// beneath it is what's actually announced/operated.
function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 10 6" aria-hidden="true" className="h-2.5 w-2.5 shrink-0 text-ordift-ink-muted">
      <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function phoneInputChange(countryCode: CountryCode, nationalNumber: string): PhoneInputChange {
  const callingCode = `+${getCountryCallingCode(countryCode)}`;
  const parsed = nationalNumber.trim() ? parsePhoneNumberFromString(nationalNumber, countryCode) : undefined;
  return {
    countryCode,
    callingCode,
    nationalNumber,
    e164: parsed?.isValid() ? parsed.number : null,
    isValid: parsed?.isValid() ?? false,
  };
}

export default function PhoneInput({
  id,
  label,
  countryCode,
  nationalNumber,
  onChange,
  error,
  required,
}: {
  id: string;
  label: string;
  countryCode: CountryCode;
  nationalNumber: string;
  onChange: (change: PhoneInputChange) => void;
  error?: string;
  required?: boolean;
}) {
  const errorId = `${id}-error`;
  const countrySelectId = `${id}-country`;
  const selected = useMemo(() => COUNTRY_OPTIONS.find((c) => c.code === countryCode) ?? COUNTRY_OPTIONS[0], [countryCode]);

  return (
    <div>
      <label htmlFor={id} className="block font-sans text-body-small font-medium text-ordift-ink mb-2">
        {label}
      </label>
      {/* One outer bordered container IS the field — the select and
          the number input below are borderless/transparent-background,
          so the whole row reads as a single continuous control. */}
      <div className="flex items-stretch rounded-lg border border-black/15 bg-white focus-within:ring-2 focus-within:ring-ordift-gold focus-within:border-transparent">
        <div className="relative shrink-0">
          <label htmlFor={countrySelectId} className="sr-only">
            Country
          </label>
          {/* Real, full-size, fully interactive select, scoped to just
              this compact left region (not the whole field) — visually
              transparent (text-transparent, not display:none/hidden,
              so it stays in the accessibility tree and keyboard/tab
              order exactly as a normal select would). Every option's
              own label is still the full "Ghana +233" — that's what
              opens when this is activated, and what a screen reader
              announces. */}
          <select
            id={countrySelectId}
            className="absolute inset-0 w-full h-full min-h-11 bg-transparent text-transparent border-0 focus:outline-none cursor-pointer"
            value={selected.code}
            onChange={(e) => onChange(phoneInputChange(e.target.value as CountryCode, nationalNumber))}
          >
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} {c.callingCode}
              </option>
            ))}
          </select>
          {/* The compact label actually shown — calling code + chevron
              only (no country code letters), tightly spaced, sized to
              content so it's correct for any calling-code length, and
              never intercepts clicks (the select above it is the real
              target). */}
          <div className="pointer-events-none flex items-center gap-1 min-h-11 pl-3 pr-2 font-sans text-body text-ordift-ink whitespace-nowrap">
            <span>{selected.callingCode}</span>
            <ChevronDownIcon />
          </div>
        </div>
        <div className="w-px self-stretch my-2 bg-black/15" aria-hidden="true" />
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required={required}
          className="flex-1 min-w-0 min-h-11 rounded-r-lg border-0 bg-transparent px-3 py-2.5 font-sans text-body text-ordift-ink placeholder:text-ordift-ink-muted/60 focus:outline-none"
          value={nationalNumber}
          onChange={(e) => onChange(phoneInputChange(selected.code, e.target.value))}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
        />
      </div>
      <p className="mt-1.5 font-sans text-caption text-ordift-ink-muted">
        Selected: {selected.name} ({selected.callingCode})
      </p>
      {error && (
        <p id={errorId} role="alert" className="mt-1 font-sans text-caption text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
