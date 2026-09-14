"use client";

import { useActionState } from "react";
import { createStatutoryWageRuleAction, type ActionState } from "./actions";
import { checkComplianceAction, type CheckComplianceState } from "./checkCompliance";

export interface WageRuleView {
  id: string;
  jurisdictionName: string;
  rateBasis: string;
  rateAmount: number | null;
  currency: string;
  monthlyConversionFactor: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  verificationStatus: string;
  sourceAuthority: string | null;
  notes: string | null;
}

export interface JurisdictionOption {
  id: string;
  name: string;
}

export interface StaffOption {
  id: string;
  name: string;
}

const RATE_BASES = ["HOURLY", "DAILY", "WEEKLY", "MONTHLY", "OTHER", "REVIEW_REQUIRED"] as const;

const STATE_STYLES: Record<string, string> = {
  COMPLIANT: "bg-green-100 text-green-800",
  BELOW_FLOOR: "bg-red-100 text-red-800",
  REVIEW_REQUIRED: "bg-amber-100 text-amber-800",
  NOT_APPLICABLE: "bg-black/5 text-ordift-ink-muted",
};

function RuleRow({ rule }: { rule: WageRuleView }) {
  return (
    <li className="rounded-lg border border-black/10 bg-white p-4 space-y-1">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-sans text-body-small font-medium text-ordift-ink">
            {rule.jurisdictionName} — {rule.rateAmount !== null ? `${rule.currency} ${rule.rateAmount}` : "no amount"} / {rule.rateBasis.toLowerCase()}
          </p>
          <p className="font-sans text-caption text-ordift-ink-muted">
            Effective {rule.effectiveFrom}{rule.effectiveTo ? ` → ${rule.effectiveTo}` : " (ongoing)"}
            {rule.monthlyConversionFactor !== null ? ` · monthly conversion factor ${rule.monthlyConversionFactor}` : ""}
            {rule.sourceAuthority ? ` · ${rule.sourceAuthority}` : ""}
          </p>
          {rule.notes && <p className="font-sans text-caption text-ordift-ink-muted mt-1">&ldquo;{rule.notes}&rdquo;</p>}
        </div>
        <span className={`px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${rule.verificationStatus === "verified" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
          {rule.verificationStatus.replace(/_/g, " ")}
        </span>
      </div>
    </li>
  );
}

function CreateRuleForm({ jurisdictionOptions }: { jurisdictionOptions: JurisdictionOption[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createStatutoryWageRuleAction, null);
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <select name="jurisdictionId" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="" disabled>Jurisdiction…</option>
        {jurisdictionOptions.map((j) => (
          <option key={j.id} value={j.id}>{j.name}</option>
        ))}
      </select>
      <select name="rateBasis" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="" disabled>Native rate basis…</option>
        {RATE_BASES.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>
      <input name="rateAmount" type="number" step="0.01" min="0" placeholder="Rate amount" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="currency" required placeholder="Currency (e.g. GHS)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="monthlyConversionFactor" type="number" step="0.0001" min="0" placeholder="Monthly conversion factor (only if legally established)" className="sm:col-span-2 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="workerCategory" placeholder="Worker category (optional)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input type="date" name="effectiveFrom" required aria-label="Effective from" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="sourceAuthority" placeholder="Source authority (optional)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="sourceReference" placeholder="Source reference (optional)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <textarea name="notes" placeholder="Notes / restrictions (optional)" className="sm:col-span-2 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" rows={2} />
      <label className="sm:col-span-2 flex items-center gap-1 font-sans text-caption text-ordift-ink-muted">
        <input type="checkbox" name="legalReviewRequired" value="true" /> This rule itself requires legal review before relying on it
      </label>
      <button type="submit" disabled={pending} className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Registering…" : "Register Statutory Wage Rule"}
      </button>
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

function ComplianceCheckForm({ staffOptions }: { staffOptions: StaffOption[] }) {
  const [state, formAction, pending] = useActionState<CheckComplianceState, FormData>(checkComplianceAction, null);
  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap gap-2">
        <select name="profileId" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
          <option value="" disabled>Check compliance for…</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button type="submit" disabled={pending} className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
          {pending ? "Checking…" : "Check"}
        </button>
      </form>
      {state?.ok === true && (
        <div className="rounded-lg border border-black/10 bg-white p-4 space-y-2">
          <span className={`px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap inline-block ${STATE_STYLES[state.state] ?? "bg-black/5"}`}>{state.state.replace(/_/g, " ")}</span>
          <p className="font-sans text-body-small text-ordift-ink">{state.explanation}</p>
          {state.rule && (
            <p className="font-sans text-caption text-ordift-ink-muted">
              Rule used: {state.rule.currency} {state.rule.rateAmount ?? "—"} / {state.rule.rateBasis.toLowerCase()}, effective {state.rule.effectiveFrom} (rule version {state.rule.id.slice(0, 8)})
            </p>
          )}
          {state.employeeMonthlySalary !== null && (
            <p className="font-sans text-caption text-ordift-ink-muted">
              Employee&rsquo;s basic salary on record: {state.employeeCurrency ?? ""} {state.employeeMonthlySalary.toLocaleString()}/month
            </p>
          )}
        </div>
      )}
      {state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
    </div>
  );
}

export function StatutoryWagesWorkspace({
  rules,
  jurisdictionOptions,
  staffOptions,
}: {
  rules: WageRuleView[];
  jurisdictionOptions: JurisdictionOption[];
  staffOptions: StaffOption[];
}) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Registered Statutory Wage Rules {rules.length > 0 ? `(${rules.length})` : ""}</h2>
        {rules.length > 0 ? (
          <ul className="space-y-3">
            {rules.map((r) => (
              <RuleRow key={r.id} rule={r} />
            ))}
          </ul>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No statutory wage rules registered yet.</p>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Check an Employee&rsquo;s Compliance</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">Shows the full calculation trace — never a bare pass/fail.</p>
        <ComplianceCheckForm staffOptions={staffOptions} />
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Register a New Statutory Wage Rule</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">
          Preserve the jurisdiction&rsquo;s own native legal basis — never force a rate into hourly×hours×days. Leave the monthly
          conversion factor blank unless a genuine, approved jurisdiction-specific methodology exists.
        </p>
        <CreateRuleForm jurisdictionOptions={jurisdictionOptions} />
      </section>
    </div>
  );
}
