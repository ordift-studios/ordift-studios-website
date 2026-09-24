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

const inputClasses =
  "w-full min-h-11 rounded-lg border border-black/15 bg-white px-4 py-2.5 font-sans text-body text-ordift-ink placeholder:text-ordift-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-ordift-gold focus:border-transparent";

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
      <div className="flex gap-2">
        <div className="shrink-0">
          <label htmlFor={countrySelectId} className="sr-only">
            Country
          </label>
          <select
            id={countrySelectId}
            className={`${inputClasses} w-[7.5rem] pr-1`}
            value={selected.code}
            onChange={(e) => onChange(phoneInputChange(e.target.value as CountryCode, nationalNumber))}
          >
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} {c.callingCode}
              </option>
            ))}
          </select>
        </div>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required={required}
          className={inputClasses}
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
