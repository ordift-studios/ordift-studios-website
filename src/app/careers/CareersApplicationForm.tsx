"use client";

import { useState } from "react";
import { compressImageFile } from "@/lib/media/clientImageCompress";
import { RECRUITMENT_ROLE_OPTIONS, RECRUITMENT_ENGAGEMENT_OPTIONS } from "@/lib/recruitment/types";

type SubmitState = "idle" | "submitting" | "success" | "error";

// Join Our Team application form (2026-08-24) — a real, working
// foundation: submits to /api/careers/apply, which writes to
// recruitment_applications (private, admin-only) and the two private
// Storage uploads. Does NOT create a Staff/Admin/Team-profile record —
// this is purely an application. Field set matches the requested
// minimum; the profile-photograph field is deliberately worded to
// avoid any confusion with an identity/passport document.
export default function CareersApplicationForm() {
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [cvName, setCvName] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [compressedPhoto, setCompressedPhoto] = useState<File | null>(null);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoName(file.name);
    setCompressing(true);
    try {
      setCompressedPhoto(await compressImageFile(file));
    } finally {
      setCompressing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("submitting");
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    if (compressedPhoto) formData.set("photo", compressedPhoto);

    try {
      const res = await fetch("/api/careers/apply", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(
          data.error === "consent-required"
            ? "Please acknowledge the consent statement to submit your application."
            : data.error === "rate-limited"
              ? "Too many submissions — please try again shortly."
              : "Something went wrong submitting your application. Please try again."
        );
      }
      setState("success");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (state === "success") {
    return (
      <div className="rounded-lg border border-ordift-gold/30 bg-ordift-gold/5 px-6 py-8 text-center">
        <p className="font-serif font-medium text-card-title text-ordift-ink mb-2">Application received.</p>
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Thank you for your interest in joining Ordift Studios. We review every application and will reach out if
          there&apos;s a fit for a current or upcoming need.
        </p>
      </div>
    );
  }

  const submitting = state === "submitting";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset disabled={submitting} className="space-y-6 disabled:opacity-60">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name *">
            <input name="fullName" type="text" required className={inputClass} />
          </Field>
          <Field label="Email Address *">
            <input name="email" type="email" required className={inputClass} />
          </Field>
          <Field label="Phone / WhatsApp Number">
            <input name="phone" type="tel" className={inputClass} />
          </Field>
          <Field label="Current Location">
            <input name="location" type="text" placeholder="City, Country" className={inputClass} />
          </Field>
          <Field label="Role / Department of Interest *">
            <select name="roleInterest" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Select…
              </option>
              {RECRUITMENT_ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type of Engagement Sought">
            <select name="engagementType" defaultValue="" className={inputClass}>
              <option value="">Not specified</option>
              {RECRUITMENT_ENGAGEMENT_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Short Introduction / About You">
          <textarea name="intro" rows={3} className={inputClass} />
        </Field>

        <Field label="Relevant Experience">
          <textarea name="experience" rows={3} className={inputClass} />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Portfolio / Website / Behance URL">
            <input name="portfolioUrl" type="url" placeholder="https://…" className={inputClass} />
          </Field>
          <Field label="Social / Professional Link">
            <input name="socialUrl" type="text" placeholder="@handle or https://…" className={inputClass} />
          </Field>
        </div>

        <Field label="Availability">
          <input name="availability" type="text" placeholder="e.g. Immediately, from March, weekends only" className={inputClass} />
        </Field>

        <Field label="Additional Message">
          <textarea name="message" rows={3} className={inputClass} />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Profile Photograph">
            <label className="flex items-center justify-center min-h-11 rounded-md border border-black/15 px-3 font-sans text-body-small cursor-pointer hover:border-black/30">
              {compressing ? "Preparing…" : photoName || "Choose file…"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoChange}
                className="hidden"
              />
            </label>
            <p className="font-sans text-caption text-ordift-ink-muted mt-1">
              Upload a clear recent headshot or passport-style photograph. Please do not upload a passport, ID card
              or other identity document.
            </p>
          </Field>

          <Field label="CV / Résumé">
            <label className="flex items-center justify-center min-h-11 rounded-md border border-black/15 px-3 font-sans text-body-small cursor-pointer hover:border-black/30">
              {cvName || "Choose file…"}
              <input
                type="file"
                name="cv"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setCvName(e.target.files?.[0]?.name ?? null)}
                className="hidden"
              />
            </label>
            <p className="font-sans text-caption text-ordift-ink-muted mt-1">PDF or Word document, up to 8MB.</p>
          </Field>
        </div>

        <label className="flex items-start gap-3">
          <input type="checkbox" name="consentAcknowledged" value="true" required className="mt-1 rounded border-black/30" />
          <span className="font-sans text-body-small text-ordift-ink-muted">
            I consent to Ordift Studios storing and reviewing the information in this application for recruitment
            purposes. *
          </span>
        </label>
      </fieldset>

      {error && (
        <p role="alert" aria-live="assertive" className="font-sans text-body-small text-red-700 bg-red-50 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="min-h-11 px-6 rounded-full bg-ordift-navy-950 text-white font-sans text-button font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting ? "Submitting…" : "Submit Application"}
      </button>
    </form>
  );
}

const inputClass = "w-full min-h-11 rounded-md border border-black/15 px-3 py-2 font-sans text-body-small text-ordift-ink bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-sans text-body-small text-ordift-ink-muted mb-1 block">{label}</span>
      {children}
    </label>
  );
}
