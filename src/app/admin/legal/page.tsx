import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { listLegalDocumentMasters, getLegalSuiteSettingsStatus } from "@/lib/legal/masterRegistry";
import {
  getLegalGovernanceOverviewCounts,
  listAgreementsForAdmin,
  listAmendmentsForAdmin,
  listReleasesForAdmin,
  listSignatureRequestsForAdmin,
  listLegalReviewQueue,
} from "@/lib/legal/governanceOverview";
import { getRecentActivityByActionPrefix } from "@/lib/admin/activityLog";

export const metadata: Metadata = {
  title: "Legal & Governance — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase H (2026-09-08).
// Admin Legal & Governance area. Every section below reads REAL rows
// from Production — there is no fixture/mock data anywhere on this
// page. As of this phase, most sections are genuinely, truthfully
// empty (no real agreement, signature request, or release has been
// created) — that emptiness is shown honestly (explicit empty-state
// copy) rather than hidden or faked. Read-only: this page has no
// forms, no server actions, no mutation of any kind — it is a
// governance/visibility surface only, matching Part 37's "truthful
// empty states, no fake data" requirement exactly.

function SectionCard({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="rounded-xl border border-black/10 bg-white p-6 space-y-4 scroll-mt-24">
      <div>
        <h2 className="font-serif font-medium text-body text-ordift-ink">{title}</h2>
        {description ? <p className="font-sans text-body-small text-ordift-ink-muted mt-1">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="font-sans text-body-small text-ordift-ink-muted italic">{label}</p>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-sans text-caption font-semibold bg-black/5 text-ordift-ink">
      {children}
    </span>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="min-w-full text-left font-sans text-body-small">
        <thead>
          <tr className="border-b border-black/10">
            {headers.map((h) => (
              <th key={h} className="px-2 py-2 font-semibold text-ordift-ink-muted uppercase tracking-wide text-caption">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-black/5">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-2 text-ordift-ink align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NAV_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "agreements", label: "Agreements" },
  { id: "templates", label: "Templates" },
  { id: "amendments", label: "Amendments" },
  { id: "releases", label: "Releases" },
  { id: "signature-requests", label: "Signature Requests" },
  { id: "review-queue", label: "Legal Review Queue" },
  { id: "public-pages", label: "Public Legal Pages" },
  { id: "versions", label: "Document Versions" },
  { id: "audit-trail", label: "Audit Trail" },
];

export default async function AdminLegalGovernancePage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  const [counts, masters, settingsStatus, agreements, amendments, releases, signatureRequests, reviewQueue, auditTrail] = await Promise.all([
    getLegalGovernanceOverviewCounts(),
    listLegalDocumentMasters(),
    getLegalSuiteSettingsStatus(),
    listAgreementsForAdmin(),
    listAmendmentsForAdmin(),
    listReleasesForAdmin(),
    listSignatureRequestsForAdmin(),
    listLegalReviewQueue(),
    getRecentActivityByActionPrefix("legal."),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Legal &amp; Governance</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Read-only governance view over the Legal Suite (masters, agreements, releases, signatures) and its audit trail. Nothing on this page sends,
          issues, or signs anything.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {NAV_SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="font-sans text-caption font-semibold px-3 py-1.5 rounded-full bg-black/5 text-ordift-ink hover:bg-black/10 transition-colors"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <SectionCard id="overview" title="Overview">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Agreements</p>
            <p className="font-serif text-body text-ordift-ink">{counts.totalAgreements}</p>
          </div>
          <div>
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Jurisdiction Review Pending</p>
            <p className="font-serif text-body text-ordift-ink">{counts.pendingReviewCount}</p>
          </div>
          <div>
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Releases Granted</p>
            <p className="font-serif text-body text-ordift-ink">{counts.activeReleases}</p>
          </div>
          <div>
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Amendments</p>
            <p className="font-serif text-body text-ordift-ink">{counts.amendmentsCount}</p>
          </div>
          <div>
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Signatures In Progress</p>
            <p className="font-serif text-body text-ordift-ink">{counts.signatureRequestsInProgress}</p>
          </div>
          <div>
            <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Signatures Completed</p>
            <p className="font-serif text-body text-ordift-ink">{counts.signatureRequestsCompleted}</p>
          </div>
        </div>
        {Object.keys(counts.agreementsByStatus).length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-2">
            {Object.entries(counts.agreementsByStatus).map(([status, n]) => (
              <Pill key={status}>
                {status}: {n}
              </Pill>
            ))}
          </div>
        ) : (
          <EmptyState label="No agreements have been created yet." />
        )}
      </SectionCard>

      <SectionCard id="agreements" title="Agreements" description="Every agreement drafted through the Agreement Engine, real reference numbers only.">
        {agreements.length === 0 ? (
          <EmptyState label="No agreements exist yet — this Legal Suite phase built the engine, it has not issued a real agreement." />
        ) : (
          <Table
            headers={["Reference", "Master", "Status", "Jurisdiction", "Created"]}
            rows={agreements.map((a) => [
              a.agreementReference,
              a.masterCode ? `${a.masterCode} — ${a.masterTitle}` : "—",
              <Pill key="s">{a.status}</Pill>,
              a.jurisdiction ?? (a.jurisdictionReviewRequired ? "Review required" : "—"),
              new Date(a.createdAt).toLocaleDateString(),
            ])}
          />
        )}
      </SectionCard>

      <SectionCard id="templates" title="Templates" description="The 21-document canonical Legal Suite catalogue and each master's current version.">
        <Table
          headers={["Code", "Title", "Classification", "Current Version Status"]}
          rows={masters.map((m) => {
            const current = m.versions.find((v) => v.id === m.currentVersionId);
            return [m.canonicalCode, m.title, m.classification.replace(/_/g, " "), current ? <Pill key="s">{current.status}</Pill> : <EmptyState key="e" label="No current version" />];
          })}
        />
      </SectionCard>

      <SectionCard id="amendments" title="Amendments" description="Append-only material post-issue changes — never a silent edit of an issued agreement.">
        {amendments.length === 0 ? (
          <EmptyState label="No amendments have been recorded — no agreement has been issued yet for one to apply to." />
        ) : (
          <Table
            headers={["Agreement", "#", "Reason", "Status", "Created"]}
            rows={amendments.map((a) => [a.agreementReference ?? a.agreementId, String(a.amendmentNumber), a.reason, <Pill key="s">{a.status}</Pill>, new Date(a.createdAt).toLocaleDateString()])}
          />
        )}
      </SectionCard>

      <SectionCard
        id="releases"
        title="Releases"
        description="Rights grants for OS-LGL-004/005/006 (Model/Talent, Property/Location, RAW). AI/synthetic-use categories default to NOT GRANTED unless explicitly selected."
      >
        {releases.length === 0 ? (
          <EmptyState label="No releases have been granted yet." />
        ) : (
          <Table
            headers={["Agreement", "Master", "Usage Rights", "AI/Synthetic Rights", "Territory", "Duration"]}
            rows={releases.map((r) => [
              r.agreementReference ?? r.agreementId,
              r.masterCode,
              r.usageRightsGranted.length ? r.usageRightsGranted.join(", ") : "none",
              r.aiSyntheticRightsGranted.length ? r.aiSyntheticRightsGranted.join(", ") : "none granted",
              r.territory ?? "—",
              r.duration ?? "—",
            ])}
          />
        )}
      </SectionCard>

      <SectionCard id="signature-requests" title="Signature Requests" description="Provider-neutral signature process status — no paid e-signature provider is used.">
        {signatureRequests.length === 0 ? (
          <EmptyState label="No signature requests exist yet." />
        ) : (
          <Table
            headers={["Agreement", "Status", "Signed", "Created"]}
            rows={signatureRequests.map((r) => [
              r.agreementReference ?? r.agreementId,
              <Pill key="s">{r.status}</Pill>,
              `${r.signedCount} / ${r.signatoryCount}`,
              new Date(r.createdAt).toLocaleDateString(),
            ])}
          />
        )}
      </SectionCard>

      <SectionCard id="review-queue" title="Legal Review Queue" description="Agreements whose jurisdiction could not be automatically routed — human review required before issuance.">
        {reviewQueue.length === 0 ? (
          <EmptyState label="Nothing is waiting on jurisdiction review." />
        ) : (
          <Table
            headers={["Reference", "Master", "Status", "Created"]}
            rows={reviewQueue.map((a) => [a.agreementReference, a.masterCode ?? "—", <Pill key="s">{a.status}</Pill>, new Date(a.createdAt).toLocaleDateString()])}
          />
        )}
      </SectionCard>

      <SectionCard id="public-pages" title="Public Legal Pages" description="The live, publicly-served legal pages at /legal/[slug] — unchanged by this Legal Suite.">
        <p className="font-sans text-body-small text-ordift-ink">
          Status: <Pill>{settingsStatus.publicLegalPagesStatus}</Pill>
        </p>
      </SectionCard>

      <SectionCard id="versions" title="Document Versions" description="Every version row across all 21 canonical masters, including the 4 legacy-reconciled OSELS versions.">
        <Table
          headers={["Master", "Version", "Status", "Effective Date", "Legacy Code"]}
          rows={masters.flatMap((m) =>
            m.versions.map((v) => [
              m.canonicalCode,
              v.version,
              <Pill key="s">{v.status}</Pill>,
              v.effectiveDate ?? "—",
              v.legacyCode ?? "—",
            ]),
          )}
        />
      </SectionCard>

      <SectionCard id="audit-trail" title="Audit Trail" description="Every legal.* action logged by this Legal Suite, most recent first.">
        {auditTrail.length === 0 ? (
          <EmptyState label="No legal.* activity has been logged yet." />
        ) : (
          <Table
            headers={["Action", "Actor", "Entity", "When"]}
            rows={auditTrail.map((e) => [e.action, e.actorLabel ?? "—", `${e.entityType} · ${e.entityId ?? "—"}`, new Date(e.createdAt).toLocaleString()])}
          />
        )}
      </SectionCard>
    </div>
  );
}
