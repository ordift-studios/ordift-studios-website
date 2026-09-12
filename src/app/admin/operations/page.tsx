import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { listUsersWithRoles, listEngagementTypes, listEmployingEntities, listEmploymentJurisdictions } from "@/lib/portal/adminData";
import { listDepartmentOptions, listGradeOptions, listPositions } from "@/lib/organization/adminData";
import { listCorporateIdentities } from "@/lib/organization/reserveCorporateIdentity";
import { listDepartmentRequests } from "@/lib/organization/departmentRequests";
import { listRecruitmentRequisitions } from "@/lib/recruitment/requisitions";
import { listGradeCompensationBands } from "@/lib/organization/gradeCompensation";
import { listAllPaymentObligations } from "@/lib/payments/payoutObligations";
import { JURISDICTIONS } from "@/lib/organization/authority";
import { reserveCorporateIdentityAction, createDepartmentRequestAction, createRecruitmentRequisitionAction, createFounderDirectHireAction } from "./actions";
import { CorporateIdentityCorrection } from "./CorporateIdentityCorrection";
import { CorporateIdentityProvisioning } from "./CorporateIdentityProvisioning";

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

  const [usersResult, departments, grades, identities, requests, requisitions, compensationBands, obligations, positions, engagementTypes, employingEntities, employmentJurisdictions] = await Promise.all([
    listUsersWithRoles(),
    listDepartmentOptions(),
    listGradeOptions(),
    listCorporateIdentities(),
    listDepartmentRequests(),
    listRecruitmentRequisitions(),
    listGradeCompensationBands(),
    listAllPaymentObligations(),
    listPositions(),
    listEngagementTypes(),
    listEmployingEntities(),
    listEmploymentJurisdictions(),
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
          Reserved internally only. A provisioning request/attempt can now be exercised end-to-end against an internal
          <strong> mock provider only</strong> (Milestone 1B, 2026-09-10) — no real Google Workspace/Microsoft 365
          mailbox integration exists yet, so &ldquo;active&rdquo; here never means a real external mailbox exists.
        </p>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {identities.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
              <div>
                <p className="font-sans text-body-small text-ordift-ink">{i.email}</p>
                <p className="font-sans text-caption text-ordift-ink-muted">
                  {peopleById.get(i.profileId) ?? i.profileId} · {i.status}
                  {i.provisioningType && ` · ${i.provisioningType}`}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <CorporateIdentityCorrection
                  identity={{ id: i.id, email: i.email, localPart: i.localPart, domain: i.domain, status: i.status }}
                  personLabel={peopleById.get(i.profileId) ?? i.profileId}
                />
                <CorporateIdentityProvisioning
                  identity={{
                    id: i.id,
                    email: i.email,
                    status: i.status,
                    provider: i.provider,
                    externalMailboxId: i.externalMailboxId,
                    provisioningType: i.provisioningType,
                    provisioningRequestedAt: i.provisioningRequestedAt,
                    provisionedAt: i.provisionedAt,
                    provisioningFailureReason: i.provisioningFailureReason,
                  }}
                  personLabel={peopleById.get(i.profileId) ?? i.profileId}
                />
              </div>
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
              <p className="font-sans text-body-small text-ordift-ink font-medium">
                {r.requestTitle}
                {r.hireOrigin === "founder_direct_hire" && (
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-ordift-gold-pressed/20 text-ordift-navy-950 font-sans text-caption">
                    Founder Direct Hire{r.directHireProfileName ? ` — ${r.directHireProfileName}` : ""}
                  </span>
                )}
              </p>
              <p className="font-sans text-caption text-ordift-ink-muted">
                {r.departmentName ?? "—"} · {r.gradeName ?? "—"} · headcount {r.headcount} · {r.requestStatus}
                {r.employingEntityName ? ` · ${r.employingEntityName}` : ""}
                {r.employmentJurisdictionName ? ` · ${r.employmentJurisdictionName}` : ""}
                {r.workLocation ? ` · ${r.workLocation}` : ""}
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

      {/* Founder Direct Hire (E.5 Stage 2M, Part 2) — a legitimate
          governed path for a very small company: the Founder
          deliberately identifies a specific real person and approves
          the hire without a public application process. NOT a bypass
          — createFounderDirectHireAction() creates AND approves a real
          recruitment_requisitions row through the same
          decideRequisition() gate as any other requisition, in one
          deliberate workflow. Super-Admin-only, enforced inside
          createRecruitmentRequisition() itself (not just this page). */}
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Founder Direct Hire</h2>
        <p className="font-sans text-caption text-ordift-ink-muted -mt-2">
          For a specific, already-identified person — not a bypass. Creates and approves a real requisition in one
          step, through the same approval gate as Standard Recruitment.
        </p>
        <form action={createFounderDirectHireAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select name="directHireProfileId" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small sm:col-span-2">
            <option value="" disabled>Person being hired…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <input type="text" name="title" placeholder="Requisition title (e.g. Client Engagement Representative)" required className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small sm:col-span-2" />
          <select name="requestedPositionId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
            <option value="">Position (optional)…</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
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
          <select name="engagementTypeId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
            <option value="">Engagement Type (optional)…</option>
            {engagementTypes.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <select name="employingEntityId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
            <option value="">Employing Entity — leave unset if undecided…</option>
            {employingEntities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
          <select name="employmentJurisdictionId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
            <option value="">Employment Jurisdiction — leave unset if undecided…</option>
            {employmentJurisdictions.map((j) => (
              <option key={j.id} value={j.id}>{j.name}</option>
            ))}
          </select>
          <input type="text" name="workLocation" placeholder="Work location (optional, free text)" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
          <input type="date" name="preferredStartDate" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small" />
          <textarea name="justification" placeholder="Justification (optional)" className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small sm:col-span-2" />
          <button type="submit" className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-gold-pressed text-ordift-navy-950">
            Create &amp; Approve Founder Direct Hire
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
