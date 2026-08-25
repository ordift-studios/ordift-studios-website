import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { listUsersWithRoles } from "@/lib/portal/adminData";
import { listDepartmentOptions, listGradeOptions } from "@/lib/organization/adminData";
import { listCorporateIdentities } from "@/lib/organization/reserveCorporateIdentity";
import { listDepartmentRequests } from "@/lib/organization/departmentRequests";
import { listRecruitmentRequisitions } from "@/lib/recruitment/requisitions";
import { listGradeCompensationBands } from "@/lib/organization/gradeCompensation";
import { listAllPaymentObligations } from "@/lib/payments/payoutObligations";
import { JURISDICTIONS } from "@/lib/organization/authority";
import { reserveCorporateIdentityAction, createDepartmentRequestAction, createRecruitmentRequisitionAction } from "./actions";

export const metadata: Metadata = {
  title: "Operations — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Ordift Organizational & Administrative Architecture V1, Phase 3.3
// (2026-08-25). Super-Admin-only inspection/testing surface for the
// operating-infrastructure foundation built this phase: corporate
// identities, cross-department requests, recruitment requisitions,
// compensation bands, and payment obligations. Deliberately minimal
// per explicit instruction not to over-design — mostly list views plus
// a few simple creation forms, matching /admin/organization's plain
// server-form style. Payment instruction details are never rendered
// here at all (payee-only/Super-Admin-only surface, out of scope for
// this general inspection page — see payeeInstructions.ts for the
// masked read layer future UI would use).
export default async function AdminOperationsPage() {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) redirect("/admin/overview");

  const [usersResult, departments, grades, identities, requests, requisitions, compensationBands, obligations] = await Promise.all([
    listUsersWithRoles(),
    listDepartmentOptions(),
    listGradeOptions(),
    listCorporateIdentities(),
    listDepartmentRequests(),
    listRecruitmentRequisitions(),
    listGradeCompensationBands(),
    listAllPaymentObligations(),
  ]);
  const people = usersResult.ok
    ? usersResult.users.map((u) => ({ id: u.id, label: u.fullName ? `${u.fullName} (${u.email ?? "no email"})` : (u.email ?? u.id) }))
    : [];
  const peopleById = new Map(people.map((p) => [p.id, p.label]));

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Operations</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Corporate identity, cross-department requests, recruitment requisitions, compensation bands, and payment
          obligations — the Phase 3.3 organizational operating infrastructure. Foundations only: no external mailbox
          or real payout has ever been created through this page. For the jurisdiction-framed executive view of this
          same data, see <Link href="/admin/executive" className="underline underline-offset-4">Executive</Link>.
        </p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Corporate Identities</h2>
        <p className="font-sans text-caption text-ordift-ink-muted -mt-2">
          Reserved internally only — no external Google Workspace/Microsoft 365 mailbox integration exists yet, so
          status never advances past what this page itself sets.
        </p>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {identities.map((i) => (
            <li key={i.id} className="flex items-center justify-between px-4 py-2.5">
              <span className="font-sans text-body-small text-ordift-ink">{i.email}</span>
              <span className="font-sans text-caption text-ordift-ink-muted">
                {peopleById.get(i.profileId) ?? i.profileId} · {i.status}
              </span>
            </li>
          ))}
          {identities.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None reserved yet.</li>}
        </ul>
        <form action={reserveCorporateIdentityAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-black/5">
          <select name="profileId" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small sm:col-span-2">
            <option value="" disabled>Choose a person…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <input type="text" name="firstName" placeholder="Legal first name" required className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
          <input type="text" name="middleNames" placeholder="Middle name(s), space-separated (optional)" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
          <input type="text" name="surname" placeholder="Surname" required className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
          <input type="text" name="additionalVerifiedNames" placeholder="Additional verified name(s) for collisions (optional)" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
          <button type="submit" className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white">
            Reserve Corporate Identity
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Cross-Department Requests</h2>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {requests.map((r) => (
            <li key={r.id} className="px-4 py-2.5">
              <p className="font-sans text-body-small text-ordift-ink font-medium">{r.title}</p>
              <p className="font-sans text-caption text-ordift-ink-muted">
                {r.requestType} · {r.requestingDepartmentName ?? r.requestingJurisdiction ?? "—"} → {r.servicingDepartmentName ?? r.servicingJurisdiction ?? "—"} · {r.status}
              </p>
            </li>
          ))}
          {requests.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None yet.</li>}
        </ul>
        <form action={createDepartmentRequestAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-black/5">
          <input type="text" name="title" placeholder="Request title" required className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small sm:col-span-2" />
          <input type="text" name="requestType" placeholder="Request type (e.g. identity_provisioning)" required className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small sm:col-span-2" />
          <select name="requestingJurisdiction" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
            <option value="">Requesting jurisdiction (optional)…</option>
            {JURISDICTIONS.map((j) => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
          <select name="servicingJurisdiction" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
            <option value="">Servicing jurisdiction (optional)…</option>
            {JURISDICTIONS.map((j) => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
          <textarea name="description" placeholder="Description (optional)" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small sm:col-span-2" />
          <button type="submit" className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white">
            Create Request
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Recruitment Requisitions</h2>
        <p className="font-sans text-caption text-ordift-ink-muted -mt-2">Always routed to People/Recruitment — no requesting department can service its own requisition.</p>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {requisitions.map((r) => (
            <li key={r.id} className="px-4 py-2.5">
              <p className="font-sans text-body-small text-ordift-ink font-medium">{r.requestTitle}</p>
              <p className="font-sans text-caption text-ordift-ink-muted">
                {r.departmentName ?? "—"} · {r.gradeName ?? "—"} · headcount {r.headcount} · {r.requestStatus}
              </p>
            </li>
          ))}
          {requisitions.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None yet.</li>}
        </ul>
        <form action={createRecruitmentRequisitionAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-black/5">
          <input type="text" name="title" placeholder="Requisition title (e.g. Finance Associate)" required className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small sm:col-span-2" />
          <select name="departmentId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
            <option value="">Department (optional)…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select name="gradeId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
            <option value="">Grade (optional)…</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>{g.code} — {g.name}</option>
            ))}
          </select>
          <input type="number" name="headcount" min={1} defaultValue={1} className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
          <textarea name="justification" placeholder="Justification (optional)" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small sm:col-span-2" />
          <button type="submit" className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white">
            Create Requisition
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Grade Compensation Bands</h2>
        <p className="font-sans text-caption text-ordift-ink-muted -mt-2">
          Structural guidance only — no salary amounts have been entered. Not everyone at a Grade earns the same amount.
        </p>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {compensationBands.map((b) => (
            <li key={b.id} className="px-4 py-2.5 font-sans text-body-small text-ordift-ink">
              {b.gradeCode} — {b.currency} {b.minimumAmount ?? "—"} / {b.midpointAmount ?? "—"} / {b.maximumAmount ?? "—"}
            </li>
          ))}
          {compensationBands.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None defined yet — no amounts populated by this phase.</li>}
        </ul>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Payment Obligations</h2>
        <p className="font-sans text-caption text-ordift-ink-muted -mt-2">
          Internal record of amounts owed — never itself a payout. No outbound-transfer provider is connected, so
          status can never advance past &ldquo;approved&rdquo; through this system today.
        </p>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {obligations.map((o) => (
            <li key={o.id} className="px-4 py-2.5">
              <p className="font-sans text-body-small text-ordift-ink">
                {peopleById.get(o.payeeProfileId) ?? o.payeeProfileId} · {o.currency} {o.amount}
              </p>
              <p className="font-sans text-caption text-ordift-ink-muted">{o.sourceType} · {o.status}</p>
            </li>
          ))}
          {obligations.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None yet.</li>}
        </ul>
      </section>
    </div>
  );
}
