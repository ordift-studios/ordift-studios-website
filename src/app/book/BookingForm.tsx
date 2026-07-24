"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { PATHWAYS, pathwayLabel } from "@/lib/enquiry/pathways";
import { BUDGET_RANGES, budgetRangeLabel } from "@/lib/enquiry/budgetRanges";
import { enquirySchema, STEP_FIELDS, type EnquiryInput } from "@/lib/enquiry/schema";
import Button from "@/components/Button";

const STEP_LABELS = [
  "Choose a service",
  "About the project",
  "Timing & budget",
  "Contact information",
  "Review & submit",
];

// `service` is kept as a plain string here (not narrowed to PathwayValue)
// since a controlled input starts as "" before the visitor picks one —
// the zod schema still enforces the real union on validation/submit.
type FormState = Omit<Partial<EnquiryInput>, "service"> & { service: string };

const initialState: FormState = {
  service: "",
  projectType: "",
  projectLocation: "",
  description: "",
  referenceLink: "",
  timeframe: "",
  budgetRange: "",
  fullName: "",
  companyName: "",
  email: "",
  phone: "",
  country: "",
  hearAboutUs: "",
  consent: undefined,
  marketingConsent: false,
  sourcePage: "",
  idempotencyKey: "",
  website: "",
};

function FieldLabel({ children, htmlFor, optional }: { children: React.ReactNode; htmlFor: string; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="block font-sans text-body-small font-medium text-ordift-ink mb-2">
      {children}
      {optional && <span className="text-ordift-ink-muted font-normal"> (optional)</span>}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 font-sans text-caption text-red-700">{message}</p>;
}

const inputClasses =
  "w-full min-h-11 rounded-lg border border-black/15 bg-white px-4 py-2.5 font-sans text-body text-ordift-ink placeholder:text-ordift-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-ordift-gold focus:border-transparent";

export default function BookingForm({ initialService }: { initialService?: string }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormState>({
    ...initialState,
    service: initialService && PATHWAYS.some((p) => p.value === initialService) ? initialService : "",
    // Generated once per form session — lets the server recognize a
    // retried submission and avoid creating a duplicate enquiry.
    idempotencyKey: typeof crypto !== "undefined" ? crypto.randomUUID() : "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-captured for the Sheet's "Source Page" column — not a visible
  // form field, so it never adds a question for the visitor to answer.
  useEffect(() => {
    update("sourcePage", document.referrer || window.location.pathname);
  }, []);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    | { status: "idle" }
    | { status: "success"; referenceNumber: string }
    | { status: "error"; message: string }
  >({ status: "idle" });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setData((d) => ({ ...d, [key]: value }));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  function validateStep(currentStep: number): boolean {
    const fields = STEP_FIELDS[currentStep as keyof typeof STEP_FIELDS];
    const mask = fields.reduce(
      (acc, field) => ({ ...acc, [field]: true }),
      {} as Record<(typeof fields)[number], true>
    );
    const stepSchema = enquirySchema.pick(mask);
    const result = stepSchema.safeParse(data);
    if (result.success) {
      setErrors({});
      return true;
    }
    const flat = z.flattenError(result.error).fieldErrors;
    const nextErrors: Record<string, string> = {};
    for (const field of fields) {
      const msg = flat[field]?.[0];
      if (msg) nextErrors[field] = msg;
    }
    setErrors(nextErrors);
    return false;
  }

  function next() {
    if (validateStep(step)) setStep((s) => Math.min(5, s + 1));
  }
  function back() {
    setErrors({});
    setStep((s) => Math.max(1, s - 1));
  }

  async function handleSubmit() {
    if (!validateStep(5)) return;
    setSubmitting(true);
    setResult({ status: "idle" });
    try {
      const res = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setResult({ status: "success", referenceNumber: json.referenceNumber });
      } else if (res.status === 422 && json.fieldErrors) {
        const nextErrors: Record<string, string> = {};
        for (const [field, msgs] of Object.entries(json.fieldErrors as Record<string, string[]>)) {
          if (msgs?.[0]) nextErrors[field] = msgs[0];
        }
        setErrors(nextErrors);
        setResult({ status: "error", message: "Please check the highlighted fields and try again." });
      } else if (res.status === 429) {
        setResult({ status: "error", message: json.message ?? "Too many requests — please try again shortly." });
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
      <div className="max-w-xl mx-auto text-center py-10">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-3">
          Enquiry received
        </p>
        <h2 className="font-serif font-medium text-page-title sm:text-page-title-tablet text-ordift-ink mb-4">
          Thank you — we&apos;ve got it.
        </h2>
        <p className="font-sans text-body text-ordift-ink-muted mb-2">
          Your reference number is
        </p>
        <p className="font-sans text-card-title font-semibold text-ordift-ink mb-6">
          {result.referenceNumber}
        </p>
        <p className="font-sans text-body-small text-ordift-ink-muted mb-8">
          Submitting this form does not confirm a booking. Ordift Studios
          will review your request and contact you to discuss
          availability, scope, timeline and pricing. A confirmation has
          been sent to your email.
        </p>
        <Button href="/" variant="secondary">
          Back to Home
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <ol className="flex items-center justify-between mb-10 sm:mb-12">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const active = n === step;
          const done = n < step;
          return (
            <li key={label} className="flex-1 flex flex-col items-center text-center">
              <span
                className={`flex items-center justify-center w-8 h-8 rounded-full font-sans text-caption font-semibold mb-2 ${
                  active
                    ? "bg-ordift-gold text-ordift-navy-950"
                    : done
                      ? "bg-ordift-navy-950 text-white"
                      : "bg-black/10 text-ordift-ink-muted"
                }`}
              >
                {n}
              </span>
              <span className="hidden sm:block font-sans text-caption text-ordift-ink-muted max-w-[80px]">
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {result.status === "error" && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-sans text-body-small text-red-700">{result.message}</p>
        </div>
      )}

      {/* Honeypot — hidden from real visitors, catches bots */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Leave this field empty</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={data.website ?? ""}
          onChange={(e) => update("website", e.target.value)}
        />
      </div>

      {step === 1 && (
        <div>
          <h2 className="font-serif font-medium text-section-heading text-ordift-ink mb-6">
            What can we help you with?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PATHWAYS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => update("service", p.value)}
                className={`text-left px-5 py-4 rounded-lg border font-sans text-body transition-colors ${
                  data.service === p.value
                    ? "border-ordift-gold bg-ordift-gold/10 text-ordift-ink"
                    : "border-black/15 text-ordift-ink hover:border-black/30"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <FieldError message={errors.service} />
          <p className="mt-6 font-sans text-body-small text-ordift-ink-muted">
            Looking for talent booking or applications?{" "}
            <Link href="/services/talent-management" className="text-ordift-gold-pressed underline underline-offset-4">
              Visit our Talent Management page
            </Link>{" "}
            — that department is still coming soon.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <h2 className="font-serif font-medium text-section-heading text-ordift-ink mb-2">
            Tell us about the project
          </h2>
          <div>
            <FieldLabel htmlFor="projectType" optional>Project type</FieldLabel>
            <input id="projectType" className={inputClasses} value={data.projectType} onChange={(e) => update("projectType", e.target.value)} placeholder="e.g. Product shoot, brand film, logo design" />
            <FieldError message={errors.projectType} />
          </div>
          <div>
            <FieldLabel htmlFor="projectLocation" optional>Project location</FieldLabel>
            <input id="projectLocation" className={inputClasses} value={data.projectLocation} onChange={(e) => update("projectLocation", e.target.value)} placeholder="e.g. Accra, Ghana" />
            <FieldError message={errors.projectLocation} />
          </div>
          <div>
            <FieldLabel htmlFor="description">Brief project description</FieldLabel>
            <textarea id="description" rows={5} className={inputClasses} value={data.description} onChange={(e) => update("description", e.target.value)} placeholder="What are you building, and what does it need to do?" />
            <FieldError message={errors.description} />
          </div>
          <div>
            <FieldLabel htmlFor="referenceLink" optional>Reference or mood-board link</FieldLabel>
            <input id="referenceLink" className={inputClasses} value={data.referenceLink} onChange={(e) => update("referenceLink", e.target.value)} placeholder="https://…" />
            <FieldError message={errors.referenceLink} />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <h2 className="font-serif font-medium text-section-heading text-ordift-ink mb-2">
            Timing and budget
          </h2>
          <div>
            <FieldLabel htmlFor="timeframe" optional>Preferred date or timeframe</FieldLabel>
            <input id="timeframe" className={inputClasses} value={data.timeframe} onChange={(e) => update("timeframe", e.target.value)} placeholder="e.g. mid-August 2026, or 'flexible'" />
            <FieldError message={errors.timeframe} />
          </div>
          <div>
            <FieldLabel htmlFor="budgetRange" optional>Estimated budget range</FieldLabel>
            <select
              id="budgetRange"
              className={inputClasses}
              value={data.budgetRange}
              onChange={(e) => update("budgetRange", e.target.value)}
            >
              <option value="">Select a range…</option>
              {BUDGET_RANGES.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
            <FieldError message={errors.budgetRange} />
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-5">
          <h2 className="font-serif font-medium text-section-heading text-ordift-ink mb-2">
            Contact information
          </h2>
          <div>
            <FieldLabel htmlFor="fullName">Full name</FieldLabel>
            <input id="fullName" className={inputClasses} value={data.fullName} onChange={(e) => update("fullName", e.target.value)} />
            <FieldError message={errors.fullName} />
          </div>
          <div>
            <FieldLabel htmlFor="companyName" optional>Company or brand name</FieldLabel>
            <input id="companyName" className={inputClasses} value={data.companyName} onChange={(e) => update("companyName", e.target.value)} />
            <FieldError message={errors.companyName} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <FieldLabel htmlFor="email">Email address</FieldLabel>
              <input id="email" type="email" className={inputClasses} value={data.email} onChange={(e) => update("email", e.target.value)} />
              <FieldError message={errors.email} />
            </div>
            <div>
              <FieldLabel htmlFor="phone">Phone or WhatsApp number</FieldLabel>
              <input id="phone" type="tel" className={inputClasses} value={data.phone} onChange={(e) => update("phone", e.target.value)} />
              <FieldError message={errors.phone} />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="country" optional>Country or current location</FieldLabel>
            <input id="country" className={inputClasses} value={data.country} onChange={(e) => update("country", e.target.value)} />
            <FieldError message={errors.country} />
          </div>
          <div>
            <FieldLabel htmlFor="hearAboutUs" optional>How did you hear about Ordift Studios?</FieldLabel>
            <input id="hearAboutUs" className={inputClasses} value={data.hearAboutUs} onChange={(e) => update("hearAboutUs", e.target.value)} />
            <FieldError message={errors.hearAboutUs} />
          </div>
        </div>
      )}

      {step === 5 && (
        <div>
          <h2 className="font-serif font-medium text-section-heading text-ordift-ink mb-6">
            Review your enquiry
          </h2>
          <dl className="divide-y divide-black/10 border-y border-black/10 mb-6">
            {[
              ["Service", pathwayLabel(data.service ?? "")],
              ["Project type", data.projectType || "—"],
              ["Project location", data.projectLocation || "—"],
              ["Description", data.description || "—"],
              ["Reference link", data.referenceLink || "—"],
              ["Timeframe", data.timeframe || "—"],
              ["Budget range", data.budgetRange ? budgetRangeLabel(data.budgetRange) : "—"],
              ["Name", data.fullName || "—"],
              ["Company", data.companyName || "—"],
              ["Email", data.email || "—"],
              ["Phone", data.phone || "—"],
              ["Country", data.country || "—"],
            ].map(([label, value]) => (
              <div key={label} className="py-3 grid grid-cols-3 gap-4">
                <dt className="font-sans text-body-small text-ordift-ink-muted">{label}</dt>
                <dd className="col-span-2 font-sans text-body-small text-ordift-ink break-words">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="rounded-lg bg-ordift-offwhite px-4 py-3 mb-6">
            <p className="font-sans text-body-small text-ordift-ink-muted">
              Submitting this form does not confirm a booking. Ordift
              Studios will review your request and contact you to discuss
              availability, scope, timeline and pricing.
            </p>
          </div>

          <label className="flex items-start gap-3 mb-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 w-4 h-4 accent-ordift-gold"
              checked={data.consent === true}
              onChange={(e) => update("consent", e.target.checked ? true : undefined)}
            />
            <span className="font-sans text-body-small text-ordift-ink">
              I&apos;ve read and agree to the{" "}
              <Link href="/legal/privacy" className="underline underline-offset-4" target="_blank">
                Privacy Notice
              </Link>
              . <span className="text-ordift-ink-muted">(Required to process this enquiry.)</span>
            </span>
          </label>
          <FieldError message={errors.consent} />

          {/* Separate, optional, unchecked by default — submitting an
              enquiry must never auto-subscribe anyone to marketing. */}
          <label className="flex items-start gap-3 mt-4 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 w-4 h-4 accent-ordift-gold"
              checked={data.marketingConsent === true}
              onChange={(e) => update("marketingConsent", e.target.checked)}
            />
            <span className="font-sans text-body-small text-ordift-ink">
              I&apos;d also like to receive occasional news, workshop
              announcements and updates from Ordift Studios.{" "}
              <span className="text-ordift-ink-muted">(Optional.)</span>
            </span>
          </label>
        </div>
      )}

      {/* Nav buttons */}
      <div className="flex items-center justify-between mt-10">
        <div>
          {step > 1 && (
            <Button variant="secondary" onClick={back}>
              Back
            </Button>
          )}
        </div>
        <div>
          {step < 5 && (
            <Button variant="primary" onClick={next}>
              Continue
            </Button>
          )}
          {step === 5 && (
            <Button variant="primary" onClick={handleSubmit} type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit Enquiry"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
