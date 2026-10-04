"use client";

import { useMemo, useState } from "react";
import type { CountryCode } from "libphonenumber-js";
import Button from "@/components/Button";
import PhoneInput from "@/components/forms/PhoneInput";
import TurnstileWidget from "@/components/TurnstileWidget";
import { REQUESTER_TYPES, SERVICE_FAMILIES, URGENCY_OPTIONS, detailQuestionsFor } from "@/lib/crewSupport/config";

export type RoleOption = { id: string; name: string; slug: string };

type Requirement = { key: number; titleId: string; customRole: string; quantity: string; responsibilities: string };

const turnstileRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
const inputClasses = "w-full min-h-11 rounded-lg border border-black/15 bg-white px-4 py-2.5 font-sans text-body text-ordift-ink placeholder:text-ordift-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-ordift-gold focus:border-transparent";
const OTHER = "__other";

function Field({ id, label, optional, error, children }: { id: string; label: string; optional?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block font-sans text-body-small font-medium text-ordift-ink mb-2">
        {label}
        {optional && <span className="text-ordift-ink-muted font-normal"> (optional)</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 font-sans text-caption text-red-700">{error}</p>
      )}
    </div>
  );
}

export default function CrewSupportForm({ roles }: { roles: RoleOption[] }) {
  const [idempotencyKey] = useState(() => (typeof crypto !== "undefined" ? crypto.randomUUID() : ""));
  const [v, setV] = useState({
    requesterType: "", fullName: "", email: "", phone: "", companyName: "", leadCompany: "", serviceFamily: "",
    projectName: "", projectType: "", projectDescription: "", startDate: "", endDate: "", multiDay: false,
    callTime: "", finishTime: "", location: "", onSiteContact: "", urgency: "standard", budgetNote: "", requesterNotes: "",
    consent: false, website: "", turnstileToken: "",
  });
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>("GH");
  const [phoneNational, setPhoneNational] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [reqs, setReqs] = useState<Requirement[]>([{ key: 1, titleId: "", customRole: "", quantity: "1", responsibilities: "" }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: "idle" } | { status: "success"; referenceNumber: string; message: string } | { status: "error"; message: string }>({ status: "idle" });

  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) => setV((s) => ({ ...s, [key]: value }));

  const family = SERVICE_FAMILIES.find((f) => f.value === v.serviceFamily);
  const roleChoices = useMemo(() => {
    if (!family) return roles;
    const preferred = roles.filter((r) => family.titleSlugs.includes(r.slug));
    return preferred.length ? preferred : roles;
  }, [family, roles]);
  const questions = v.serviceFamily ? detailQuestionsFor(v.serviceFamily) : [];

  function updateReq(key: number, patch: Partial<Requirement>) {
    setReqs((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrors({});
    setResult({ status: "idle" });
    try {
      const res = await fetch("/api/crew-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterType: v.requesterType, fullName: v.fullName, email: v.email, phone: v.phone || `+${phoneNational}`,
          companyName: v.companyName, leadCompany: v.leadCompany, serviceFamily: v.serviceFamily, projectName: v.projectName,
          projectType: v.projectType, projectDescription: v.projectDescription, startDate: v.startDate,
          endDate: v.multiDay ? v.endDate : v.startDate, callTime: v.callTime, finishTime: v.finishTime, location: v.location,
          onSiteContact: v.onSiteContact, urgency: v.urgency, budgetNote: v.budgetNote, requesterNotes: v.requesterNotes,
          requirements: reqs.map((r) => ({ titleId: r.titleId === OTHER ? "" : r.titleId, customRole: r.customRole, quantity: r.quantity, responsibilities: r.responsibilities })),
          serviceDetails: details, consent: v.consent, idempotencyKey, website: v.website, turnstileToken: v.turnstileToken,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        setResult({ status: "success", referenceNumber: json.referenceNumber, message: json.message });
      } else if (res.status === 422 && json.fieldErrors) {
        const next: Record<string, string> = {};
        for (const [field, msgs] of Object.entries(json.fieldErrors as Record<string, string[]>)) next[field] = msgs[0];
        setErrors(next);
        setResult({ status: "error", message: "Please check the highlighted fields and try again." });
      } else {
        setResult({ status: "error", message: json.message ?? "We couldn't send your request. Please try again." });
      }
    } catch {
      setResult({ status: "error", message: "We couldn't send your request. Please check your connection and try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (result.status === "success") {
    return (
      <div className="max-w-2xl mx-auto rounded-xl border border-black/10 bg-ordift-offwhite p-6 sm:p-8" role="status">
        <p className="font-serif font-medium text-card-title text-ordift-ink mb-3">Request received.</p>
        <p className="font-sans text-body text-ordift-ink mb-4">{result.message}</p>
        <p className="font-sans text-body-small text-ordift-ink-muted">Your reference number: <strong className="text-ordift-ink">{result.referenceNumber}</strong></p>
        <p className="font-sans text-caption text-ordift-ink-muted mt-4">This is a request, not a booking — crew availability isn&apos;t confirmed until Ordift replies.</p>
      </div>
    );
  }

  const fieldset = "space-y-5 rounded-xl border border-black/10 p-5 sm:p-6";
  const legend = "px-2 font-serif font-medium text-body text-ordift-ink";

  return (
    <form onSubmit={submit} noValidate className="max-w-2xl mx-auto space-y-8">
      <fieldset className={fieldset}>
        <legend className={legend}>About you</legend>
        <Field id="requesterType" label="Who is requesting support?" error={errors.requesterType}>
          <select id="requesterType" className={inputClasses} value={v.requesterType} onChange={(e) => set("requesterType", e.target.value)}>
            <option value="">Choose…</option>
            {REQUESTER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field id="fullName" label="Full name" error={errors.fullName}><input id="fullName" className={inputClasses} value={v.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="name" /></Field>
        <Field id="email" label="Email" error={errors.email}><input id="email" type="email" className={inputClasses} value={v.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" /></Field>
        <PhoneInput id="phone" label="Phone or WhatsApp number" countryCode={phoneCountry} nationalNumber={phoneNational} error={errors.phone}
          onChange={(c) => { setPhoneCountry(c.countryCode); setPhoneNational(c.nationalNumber); set("phone", c.e164 ?? `${c.callingCode}${c.nationalNumber}`); }} />
        <Field id="companyName" label="Your studio or company" optional error={errors.companyName}><input id="companyName" className={inputClasses} value={v.companyName} onChange={(e) => set("companyName", e.target.value)} /></Field>
        <Field id="leadCompany" label="Lead company / studio on this project, if different" optional error={errors.leadCompany}><input id="leadCompany" className={inputClasses} value={v.leadCompany} onChange={(e) => set("leadCompany", e.target.value)} /></Field>
      </fieldset>

      <fieldset className={fieldset}>
        <legend className={legend}>The project</legend>
        <Field id="serviceFamily" label="What kind of support do you need?" error={errors.serviceFamily}>
          <select id="serviceFamily" className={inputClasses} value={v.serviceFamily} onChange={(e) => set("serviceFamily", e.target.value)}>
            <option value="">Choose…</option>
            {SERVICE_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </Field>
        <Field id="projectName" label="Project or event name" error={errors.projectName}><input id="projectName" className={inputClasses} value={v.projectName} onChange={(e) => set("projectName", e.target.value)} /></Field>
        <Field id="projectType" label="Type of project" optional error={errors.projectType}><input id="projectType" className={inputClasses} placeholder="Wedding, corporate event, commercial shoot…" value={v.projectType} onChange={(e) => set("projectType", e.target.value)} /></Field>
        <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink">
          <input type="checkbox" className="w-4 h-4" checked={v.multiDay} onChange={(e) => set("multiDay", e.target.checked)} />
          This runs over more than one day
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field id="startDate" label={v.multiDay ? "First day" : "Date"} error={errors.startDate}><input id="startDate" type="date" className={inputClasses} value={v.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
          {v.multiDay && <Field id="endDate" label="Last day" error={errors.endDate}><input id="endDate" type="date" className={inputClasses} value={v.endDate} onChange={(e) => set("endDate", e.target.value)} /></Field>}
          <Field id="callTime" label="Call / start time" optional error={errors.callTime}><input id="callTime" type="time" className={inputClasses} value={v.callTime} onChange={(e) => set("callTime", e.target.value)} /></Field>
          <Field id="finishTime" label="Expected finish" optional error={errors.finishTime}><input id="finishTime" type="time" className={inputClasses} value={v.finishTime} onChange={(e) => set("finishTime", e.target.value)} /></Field>
        </div>
        <Field id="location" label="Location / venue" error={errors.location}><input id="location" className={inputClasses} value={v.location} onChange={(e) => set("location", e.target.value)} /></Field>
        <Field id="onSiteContact" label="Lead contact on site" optional error={errors.onSiteContact}><input id="onSiteContact" className={inputClasses} value={v.onSiteContact} onChange={(e) => set("onSiteContact", e.target.value)} /></Field>
      </fieldset>

      <fieldset className={fieldset}>
        <legend className={legend}>Crew you need</legend>
        {errors.requirements && <p role="alert" className="font-sans text-caption text-red-700">{errors.requirements}</p>}
        {reqs.map((r, i) => (
          <div key={r.key} className="space-y-4 rounded-lg border border-black/10 p-4">
            <div className="flex items-center justify-between">
              <p className="font-sans text-body-small font-medium text-ordift-ink">Role {i + 1}</p>
              {reqs.length > 1 && (
                <button type="button" onClick={() => setReqs((list) => list.filter((x) => x.key !== r.key))} className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">Remove</button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <Field id={`role-${r.key}`} label="Role" error={errors[`requirements.${i}.customRole`]}>
                  <select id={`role-${r.key}`} className={inputClasses} value={r.titleId} onChange={(e) => updateReq(r.key, { titleId: e.target.value })}>
                    <option value="">Choose…</option>
                    {roleChoices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    <option value={OTHER}>Other (describe)</option>
                  </select>
                </Field>
              </div>
              <Field id={`qty-${r.key}`} label="How many?" error={errors[`requirements.${i}.quantity`]}>
                <input id={`qty-${r.key}`} type="number" min={1} max={50} className={inputClasses} value={r.quantity} onChange={(e) => updateReq(r.key, { quantity: e.target.value })} />
              </Field>
            </div>
            {(r.titleId === OTHER || roles.length === 0) && (
              <Field id={`custom-${r.key}`} label="Describe the role" error={errors[`requirements.${i}.customRole`]}>
                <input id={`custom-${r.key}`} className={inputClasses} value={r.customRole} onChange={(e) => updateReq(r.key, { customRole: e.target.value })} />
              </Field>
            )}
            <Field id={`resp-${r.key}`} label="What will they be responsible for?" optional>
              <textarea id={`resp-${r.key}`} rows={2} className={inputClasses} value={r.responsibilities} onChange={(e) => updateReq(r.key, { responsibilities: e.target.value })} />
            </Field>
          </div>
        ))}
        {reqs.length < 10 && (
          <button type="button" onClick={() => setReqs((list) => [...list, { key: Date.now(), titleId: "", customRole: "", quantity: "1", responsibilities: "" }])} className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">
            + Add another role
          </button>
        )}
      </fieldset>

      {questions.length > 0 && (
        <fieldset className={fieldset}>
          <legend className={legend}>A few details</legend>
          {questions.map((q) => (
            <Field key={q.id} id={`detail-${q.id}`} label={q.label} optional>
              {q.kind === "textarea" ? (
                <textarea id={`detail-${q.id}`} rows={3} className={inputClasses} value={details[q.id] ?? ""} onChange={(e) => setDetails((d) => ({ ...d, [q.id]: e.target.value }))} />
              ) : q.kind === "select" ? (
                <select id={`detail-${q.id}`} className={inputClasses} value={details[q.id] ?? ""} onChange={(e) => setDetails((d) => ({ ...d, [q.id]: e.target.value }))}>
                  <option value="">Choose…</option>
                  {q.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input id={`detail-${q.id}`} className={inputClasses} value={details[q.id] ?? ""} onChange={(e) => setDetails((d) => ({ ...d, [q.id]: e.target.value }))} />
              )}
            </Field>
          ))}
        </fieldset>
      )}

      <details className="rounded-xl border border-black/10 p-5 sm:p-6">
        <summary className="cursor-pointer font-serif font-medium text-body text-ordift-ink">More information (optional)</summary>
        <div className="space-y-5 mt-5">
          <Field id="projectDescription" label="Anything else about the project" optional error={errors.projectDescription}><textarea id="projectDescription" rows={3} className={inputClasses} value={v.projectDescription} onChange={(e) => set("projectDescription", e.target.value)} /></Field>
          <Field id="urgency" label="How soon do you need an answer?"><select id="urgency" className={inputClasses} value={v.urgency} onChange={(e) => set("urgency", e.target.value)}>{URGENCY_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</select></Field>
          <Field id="budgetNote" label="Budget or rate you have in mind" optional error={errors.budgetNote}><input id="budgetNote" className={inputClasses} value={v.budgetNote} onChange={(e) => set("budgetNote", e.target.value)} /></Field>
          <Field id="requesterNotes" label="Notes for the Ordift team" optional error={errors.requesterNotes}><textarea id="requesterNotes" rows={3} className={inputClasses} value={v.requesterNotes} onChange={(e) => set("requesterNotes", e.target.value)} /></Field>
        </div>
      </details>

      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" tabIndex={-1} autoComplete="off" value={v.website} onChange={(e) => set("website", e.target.value)} />
      </div>

      <div className="space-y-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 w-4 h-4" checked={v.consent} onChange={(e) => set("consent", e.target.checked)} aria-describedby={errors.consent ? "consent-error" : undefined} />
          <span className="font-sans text-body-small text-ordift-ink">
            I&apos;ve read the <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-ordift-gold-pressed underline underline-offset-4">Privacy Notice</a> and agree Ordift may use these details to respond to this request.
          </span>
        </label>
        {errors.consent && <p id="consent-error" role="alert" className="font-sans text-caption text-red-700">{errors.consent}</p>}
        <TurnstileWidget onVerify={(token) => set("turnstileToken", token)} onExpire={() => set("turnstileToken", "")} />
      </div>

      {result.status === "error" && <p role="alert" className="font-sans text-body-small text-red-700">{result.message}</p>}

      <Button variant="primary" type="submit" disabled={submitting || (turnstileRequired && !v.turnstileToken)}>
        {submitting ? "Submitting…" : "Submit request"}
      </Button>
      <p className="font-sans text-caption text-ordift-ink-muted">Submitting is a request, not a booking. Ordift will confirm availability, pricing and next steps.</p>
    </form>
  );
}
