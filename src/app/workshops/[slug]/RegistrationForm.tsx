"use client";

import { useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { workshopRegistrationSchema } from "@/lib/workshops/registrationSchema";
import Button from "@/components/Button";
import TurnstileWidget from "@/components/TurnstileWidget";

const inputClasses =
  "w-full min-h-11 rounded-lg border border-black/15 bg-white px-4 py-2.5 font-sans text-body text-ordift-ink placeholder:text-ordift-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-ordift-gold focus:border-transparent";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 font-sans text-caption text-red-700">
      {message}
    </p>
  );
}

function fieldAria(fieldId: string, error?: string) {
  return {
    "aria-describedby": error ? `${fieldId}-error` : undefined,
    "aria-invalid": error ? (true as const) : undefined,
  };
}

type FormState = {
  firstName: string;
  middleName: string;
  surname: string;
  email: string;
  phoneCountryCode: string;
  phone: string;
  country: string;
  experienceLevel: "" | "beginner" | "intermediate" | "advanced" | "all-levels";
  ticketTypeId: string;
  assistanceType: "" | "accommodation" | "transport" | "both";
  arrivalDate: string;
  departureDate: string;
  travellerCount: string;
  assistanceNotes: string;
  consent: boolean;
  website: string;
  turnstileToken: string;
};

// Workshop Management V1, Phase B (2026-08-25) — ticketTypes prop is
// empty for a workshop with no configured tiers; the ticket selector
// simply doesn't render (registration remains exactly as it worked
// before ticket types existed).
export type RegistrationTicketOption = { id: string; name: string; priceUsd: number; description: string | null };

// Inlined at build time, same as inside TurnstileWidget itself — lets
// the submit button require a completed challenge only when Turnstile
// is actually configured, without a round trip to find out.
const turnstileRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

export default function RegistrationForm({
  workshopSlug,
  ticketTypes = [],
}: {
  workshopSlug: string;
  ticketTypes?: RegistrationTicketOption[];
}) {
  const [data, setData] = useState<FormState>({
    firstName: "",
    middleName: "",
    surname: "",
    email: "",
    phoneCountryCode: "",
    phone: "",
    country: "",
    experienceLevel: "",
    ticketTypeId: ticketTypes.length === 1 ? ticketTypes[0].id : "",
    assistanceType: "",
    arrivalDate: "",
    departureDate: "",
    travellerCount: "",
    assistanceNotes: "",
    consent: false,
    website: "",
    turnstileToken: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    | { status: "idle" }
    | { status: "success"; reference: string; registrationStatus: string; waitingListPosition: number | null }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" ? crypto.randomUUID() : ""
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setData((d) => ({ ...d, [key]: value }));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = workshopRegistrationSchema.safeParse({
      ...data,
      experienceLevel: data.experienceLevel || undefined,
      assistanceType: data.assistanceType || undefined,
      travellerCount: data.travellerCount || undefined,
      consent: data.consent || undefined,
      workshopSlug,
      idempotencyKey,
    });
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error).fieldErrors;
      const nextErrors: Record<string, string> = {};
      for (const [field, msgs] of Object.entries(flat)) {
        if (msgs?.[0]) nextErrors[field] = msgs[0];
      }
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setResult({ status: "idle" });
    try {
      const res = await fetch("/api/workshop-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(parsed.data),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setResult({
          status: "success",
          reference: json.registrationReference,
          registrationStatus: json.registrationStatus,
          waitingListPosition: json.waitingListPosition,
        });
      } else if (res.status === 422 && json.fieldErrors) {
        const nextErrors: Record<string, string> = {};
        for (const [field, msgs] of Object.entries(json.fieldErrors as Record<string, string[]>)) {
          if (msgs?.[0]) nextErrors[field] = msgs[0];
        }
        setErrors(nextErrors);
      } else {
        setResult({ status: "error", message: json.message ?? "Something went wrong. Please try again." });
      }
    } catch {
      setResult({ status: "error", message: "Network error — please check your connection and try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (result.status === "success") {
    return (
      <div className="rounded-xl border border-black/10 bg-ordift-offwhite p-6 sm:p-8 text-center">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
          {result.registrationStatus === "Waitlisted" ? "You're on the waiting list" : "Registration received"}
        </p>
        <p className="font-serif font-medium text-card-title text-ordift-ink mb-2">{result.reference}</p>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          {result.registrationStatus === "Waitlisted"
            ? `This workshop is currently full — you're at waiting-list position ${result.waitingListPosition ?? "—"}. We'll email you if a space opens up.`
            : "A confirmation has been sent to your email. Payment (if required) is confirmed manually — we'll follow up with details."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {result.status === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-body-small text-red-700">{result.message}</p>
        </div>
      )}

      <div className="hidden" aria-hidden="true">
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={data.website}
          onChange={(e) => update("website", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div>
          <label htmlFor="firstName" className="block font-sans text-body-small font-medium text-ordift-ink mb-2">
            First name
          </label>
          <input id="firstName" className={inputClasses} value={data.firstName} onChange={(e) => update("firstName", e.target.value)} {...fieldAria("firstName", errors.firstName)} />
          <FieldError id="firstName-error" message={errors.firstName} />
        </div>
        <div>
          <label htmlFor="middleName" className="block font-sans text-body-small font-medium text-ordift-ink mb-2">
            Middle name <span className="text-ordift-ink-muted font-normal">(optional)</span>
          </label>
          <input id="middleName" className={inputClasses} value={data.middleName} onChange={(e) => update("middleName", e.target.value)} />
        </div>
        <div>
          <label htmlFor="surname" className="block font-sans text-body-small font-medium text-ordift-ink mb-2">
            Surname
          </label>
          <input id="surname" className={inputClasses} value={data.surname} onChange={(e) => update("surname", e.target.value)} {...fieldAria("surname", errors.surname)} />
          <FieldError id="surname-error" message={errors.surname} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="email" className="block font-sans text-body-small font-medium text-ordift-ink mb-2">
            Email address
          </label>
          <input id="email" type="email" className={inputClasses} value={data.email} onChange={(e) => update("email", e.target.value)} {...fieldAria("email", errors.email)} />
          <FieldError id="email-error" message={errors.email} />
        </div>
        <div>
          <label htmlFor="phone" className="block font-sans text-body-small font-medium text-ordift-ink mb-2">
            Phone or WhatsApp number
          </label>
          <div className="flex gap-2">
            <input
              id="phoneCountryCode"
              placeholder="+974"
              aria-label="Phone country code"
              className={`${inputClasses} w-20 shrink-0`}
              value={data.phoneCountryCode}
              onChange={(e) => update("phoneCountryCode", e.target.value)}
            />
            <input id="phone" type="tel" className={inputClasses} value={data.phone} onChange={(e) => update("phone", e.target.value)} {...fieldAria("phone", errors.phone)} />
          </div>
          <FieldError id="phone-error" message={errors.phone} />
        </div>
      </div>

      <div>
        <label htmlFor="country" className="block font-sans text-body-small font-medium text-ordift-ink mb-2">
          Country of residence <span className="text-ordift-ink-muted font-normal">(optional)</span>
        </label>
        <input id="country" className={inputClasses} value={data.country} onChange={(e) => update("country", e.target.value)} />
      </div>

      {ticketTypes.length > 0 && (
        <div>
          <label htmlFor="ticketTypeId" className="block font-sans text-body-small font-medium text-ordift-ink mb-2">
            Registration type
          </label>
          <select
            id="ticketTypeId"
            className={inputClasses}
            value={data.ticketTypeId}
            onChange={(e) => update("ticketTypeId", e.target.value)}
          >
            <option value="">Select…</option>
            {ticketTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.priceUsd > 0 ? `— $${t.priceUsd.toFixed(2)}` : "— Free"}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="experienceLevel" className="block font-sans text-body-small font-medium text-ordift-ink mb-2">
          Experience level <span className="text-ordift-ink-muted font-normal">(optional)</span>
        </label>
        <select
          id="experienceLevel"
          className={inputClasses}
          value={data.experienceLevel}
          onChange={(e) => update("experienceLevel", e.target.value as FormState["experienceLevel"])}
        >
          <option value="">Select…</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
          <option value="all-levels">All levels</option>
        </select>
      </div>

      <div className="rounded-lg border border-black/10 p-4 space-y-3">
        <p className="font-sans text-body-small font-medium text-ordift-ink">
          Travel assistance <span className="text-ordift-ink-muted font-normal">(optional — request only, we arrange this manually)</span>
        </p>
        <select
          id="assistanceType"
          aria-label="Travel assistance type"
          className={inputClasses}
          value={data.assistanceType}
          onChange={(e) => update("assistanceType", e.target.value as FormState["assistanceType"])}
        >
          <option value="">No assistance required</option>
          <option value="accommodation">Accommodation assistance</option>
          <option value="transport">Airport transfer / local transport assistance</option>
          <option value="both">Both accommodation and transport assistance</option>
        </select>
        {data.assistanceType && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="date"
              aria-label="Arrival date"
              className={inputClasses}
              value={data.arrivalDate}
              onChange={(e) => update("arrivalDate", e.target.value)}
            />
            <input
              type="date"
              aria-label="Departure date"
              className={inputClasses}
              value={data.departureDate}
              onChange={(e) => update("departureDate", e.target.value)}
            />
            <input
              type="number"
              min={1}
              placeholder="Number of travellers"
              aria-label="Number of travellers"
              className={inputClasses}
              value={data.travellerCount}
              onChange={(e) => update("travellerCount", e.target.value)}
            />
            <textarea
              placeholder="Notes / preferences (optional)"
              aria-label="Travel assistance notes"
              className={`${inputClasses} sm:col-span-2`}
              rows={2}
              value={data.assistanceNotes}
              onChange={(e) => update("assistanceNotes", e.target.value)}
            />
          </div>
        )}
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1 w-4 h-4 accent-ordift-gold"
          checked={data.consent}
          onChange={(e) => update("consent", e.target.checked)}
          {...fieldAria("consent", errors.consent)}
        />
        <span className="font-sans text-body-small text-ordift-ink">
          I&apos;ve read and agree to the{" "}
          <Link href="/legal/privacy" className="underline underline-offset-4" target="_blank">
            Privacy Notice
          </Link>
          .
        </span>
      </label>
      <FieldError id="consent-error" message={errors.consent} />

      <TurnstileWidget
        onVerify={(token) => update("turnstileToken", token)}
        onExpire={() => update("turnstileToken", "")}
      />

      <Button
        type="submit"
        variant="primary"
        disabled={submitting || (turnstileRequired && !data.turnstileToken)}
        className="w-full sm:w-auto"
      >
        {submitting ? "Registering…" : "Register"}
      </Button>
    </form>
  );
}
