import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { isManagementUser } from "@/lib/crewSupport/management";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPortfolioSourceFiles } from "@/lib/portfolio/sourceFiles";
import { getJobPermissionView, getStandings, listContractCandidates } from "@/lib/portfolio/library";
import { PORTFOLIO_LIBRARY_ENABLED } from "@/lib/portfolio/featureGate";
import { PERMISSION_TEXT_APPROVED } from "@/lib/portfolio/permissionText";
import { DESTINATION_LABEL, isJobType, jobKey, type Destination } from "@/lib/portfolio/destinations";
import { SOURCE_LABEL, GRANTOR_CAPACITIES } from "@/lib/portfolio/permissionModel";
import { ContractForm, PhotoReview, RecordPermissionForm, RequestForm, UseForm, VerifyForm } from "../../JobForms";

export const metadata: Metadata = { title: "Job permission & approval — Ordift Studios Admin", robots: { index: false, follow: false } };

// One job: where its photographs stand on the two approvals (the rights holder's permission, then Ordift's own internal approval), and the controls for each.
// Management only. While the portfolio library is not switched on this page is a read-only summary and changes nothing.
export default async function JobPermissionPage({ params }: { params: Promise<{ jobType: string; jobId: string }> }) {
  const { jobType, jobId } = await params;
  const user = await getCurrentUser();
  if (!user || !isStaffOrAdmin(user)) redirect("/admin/overview");
  if (!isJobType(jobType) || !/^[0-9a-f-]{36}$/i.test(jobId)) notFound();
  if (!(await isManagementUser(user))) return <p className="font-sans text-body-small text-ordift-ink-muted">Job photographs and their permissions are visible to a Super Admin or executive admin only.</p>;

  const key = jobKey(jobType, jobId.toLowerCase());
  const { files, jobs } = await listPortfolioSourceFiles({ job: key }, 200);
  const job = jobs.find((j) => j.key === key);
  if (!job) notFound();

  const enabled = PORTFOLIO_LIBRARY_ENABLED;
  const view = enabled ? await getJobPermissionView(jobType, jobId) : null;
  const contracts = enabled ? await listContractCandidates(jobType, jobId) : [];
  const standings: Awaited<ReturnType<typeof getStandings>> = enabled ? await getStandings(files.map((f) => f.id)) : {};

  let addressee: { id: string; name: string } | null = null;
  if (enabled && jobType === "crew_support_request") {
    const admin = createAdminClient();
    const { data: req } = await admin.from("crew_support_requests").select("enquiry_id").eq("id", jobId).maybeSingle();
    const { data: enq } = req ? await admin.from("enquiries").select("user_id").eq("id", req.enquiry_id).maybeSingle() : { data: null };
    if (enq?.user_id) { const { data: p } = await admin.from("profiles").select("id, full_name").eq("id", enq.user_id).maybeSingle(); if (p) addressee = { id: p.id as string, name: (p.full_name as string | null) ?? "the client" }; }
  }
  const nameOf = (id: string) => files.find((f) => f.id === id)?.filename ?? id;
  const records = view?.records ?? [];

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <Link href="/admin/enquiries/quick-price/portfolio?mode=jobs" className="font-sans text-body-small text-ordift-gold-pressed underline">← Quick Portfolio Picker</Link>
        <h1 className="mt-3 font-serif font-medium text-section-heading text-ordift-ink">{job.title}</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted">{job.service ? `${job.service.replace(/_/g, " ")} · ` : ""}{job.date ?? "date not recorded"} · {job.imageCount} image{job.imageCount === 1 ? "" : "s"}</p>
        <p className="mt-2 rounded-lg bg-amber-50 p-3 font-sans text-caption text-amber-900">A photograph can be published or shared for a use only when <strong>both</strong> the rights holder&apos;s marketing permission <strong>and</strong> Ordift&apos;s internal approval cover that use, and both are re-checked at the moment of use. Delivery to the client is never affected by anything on this page.</p>
      </div>

      {!enabled ? (
        <p className="rounded-lg bg-black/5 p-4 font-sans text-body-small text-ordift-ink-muted">Recording permission, requesting it from the client and approving photographs internally are not switched on yet: they need database changes that have not been authorised or applied. Until then every photograph of this job is treated as <strong>not cleared</strong>, and nothing on this page can change that.</p>
      ) : (
        <>
          <section aria-labelledby="held" className="space-y-3">
            <h2 id="held" className="font-serif font-medium text-body text-ordift-ink">Marketing permission on record</h2>
            {records.length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">Nothing is on record, so nothing is cleared. This is the starting point for every job.</p> : (
              <ul className="space-y-2">
                {records.map((r) => (
                  <li key={r.id} className="rounded-xl border border-black/10 bg-white p-3 space-y-1">
                    <p className="font-sans text-body-small font-medium text-ordift-ink">{r.decision === "granted" ? "Permission given" : r.decision === "declined" ? "Permission refused" : r.decision === "withdrawn" ? "Permission withdrawn" : "Verification recorded"} · {SOURCE_LABEL[r.source as keyof typeof SOURCE_LABEL]}</p>
                    <p className="font-sans text-caption text-ordift-ink-muted">By {r.grantorName} ({GRANTOR_CAPACITIES.find((c) => c.key === r.grantorCapacity)?.label ?? r.grantorCapacity}) · recorded {r.recordedAt.slice(0, 10)}{r.grantedOn ? ` · given ${r.grantedOn}` : r.source === "admin_recorded" ? " · date of authorisation not established" : ""}{r.method ? ` · by ${r.method}` : ""}</p>
                    {r.decision === "granted" && <p className="font-sans text-caption">Uses: {r.destinations.map((d) => DESTINATION_LABEL[d as Destination] ?? d).join(", ")} · {r.wholeJob ? "whole job" : "selected photographs"}{r.expiresOn ? ` · until ${r.expiresOn}` : ""}{r.restrictions ? ` · restrictions: ${r.restrictions}` : ""}</p>}
                    {r.agreementReference && <p className="font-sans text-caption">Agreement {r.agreementReference}, clause {r.clause}</p>}
                    {r.evidence && <p className="font-sans text-caption text-ordift-ink-muted">Evidence: {r.evidence}</p>}
                    {r.note && <p className="font-sans text-caption text-ordift-ink-muted">Note: {r.note}</p>}
                    {r.decision === "granted" && r.verification !== "verified" && !records.some((x) => x.decision === "verified" && x.supersedes === r.id) && (<><p className="font-sans text-caption text-amber-900">Verification still required: this does not count until verified.</p><VerifyForm jobType={jobType} jobId={jobId} recordId={r.id} /></>)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="route-a" className="space-y-3"><h2 id="route-a" className="font-serif font-medium text-body text-ordift-ink">Recognise permission from a signed agreement</h2>
            <ContractForm jobType={jobType} jobId={jobId} agreements={contracts.map((c) => ({ id: c.id, reference: c.reference, executed: c.executed, summary: c.release ? `release: ${Object.entries(c.release.usage_rights).filter(([, v]) => v).map(([k]) => k).join(", ") || "no uses granted"}; ${c.release.territory ?? "territory not set"}; ${c.release.duration ?? "term not set"}` : "no release recorded" }))} /></section>

          <section aria-labelledby="route-b" className="space-y-3"><h2 id="route-b" className="font-serif font-medium text-body text-ordift-ink">Ask the client in their portal</h2>
            <RequestForm jobType={jobType} jobId={jobId} addressee={addressee} approved={PERMISSION_TEXT_APPROVED} />
            {(view?.requests ?? []).length > 0 && <ul className="font-sans text-caption text-ordift-ink-muted">{view!.requests.map((q) => <li key={q.id as string}>Request {String(q.created_at).slice(0, 10)}: {q.status as string}</li>)}</ul>}</section>

          <section aria-labelledby="route-c" className="space-y-3"><h2 id="route-c" className="font-serif font-medium text-body text-ordift-ink">Record permission obtained outside the platform</h2>
            <p className="font-sans text-body-small text-ordift-ink-muted">For permission given in conversation, messages or a document. Enter only what you can show. It is labelled &ldquo;recorded by an administrator&rdquo; and is never presented as something the client did in the portal. No date, wording or signature is filled in for you.</p>
            <RecordPermissionForm jobType={jobType} jobId={jobId} files={files.map((f) => ({ id: f.id, name: f.filename }))} /></section>

          <section aria-labelledby="stage2" className="space-y-3"><h2 id="stage2" className="font-serif font-medium text-body text-ordift-ink">Internal approval of each photograph</h2>
            <PhotoReview jobType={jobType} jobId={jobId} photos={files.map((f) => ({ id: f.id, name: f.filename, kind: f.kindLabel, permission: standings[f.id]?.permission ?? "No permission on record", internal: standings[f.id]?.internal ?? "Not yet reviewed internally", usable: (standings[f.id]?.usable ?? []).map((d) => DESTINATION_LABEL[d]) }))} /></section>

          <section aria-labelledby="uses" className="space-y-3"><h2 id="uses" className="font-serif font-medium text-body text-ordift-ink">Record that a photograph was used</h2>
            <p className="font-sans text-body-small text-ordift-ink-muted">The database re-checks both approvals at this moment and refuses a use that no longer qualifies. Withdrawal or revocation later flags anything already in use for your review; it never removes anything automatically.</p>
            <UseForm jobType={jobType} jobId={jobId} files={files.map((f) => ({ id: f.id, name: nameOf(f.id) }))} /></section>
        </>
      )}
    </div>
  );
}
