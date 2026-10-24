import { createAdminClient } from "@/lib/supabase/admin";
import { jobKey, type JobType } from "./destinations";

// READ-ONLY browse of photographs already stored for jobs (project_files), for the internal Quick Portfolio Picker. It points at the source files
// and copies nothing. Until the permission tables exist (migrations 0169-0171, not applied) no marketing permission is recorded anywhere, so EVERY
// photograph is reported as not cleared. Callers must be management users.

export type SourceFile = {
  id: string; filename: string; mimeType: string | null; kind: string; kindLabel: string; releaseStatus: string; retained: boolean;
  jobKey: string; jobType: JobType; jobId: string; jobLabel: string; jobReference: string | null; service: string | null; isTest: boolean; clearance: "not_cleared";
};
export type PortfolioJob = {
  key: string; jobType: JobType; jobId: string; reference: string | null; title: string; service: string | null; date: string | null;
  imageCount: number; finalCount: number; isTest: boolean;
};
export type SourceFilter = { q?: string; kind?: string; service?: string; job?: string; ids?: string[] };

const KIND_LABEL: Record<string, string> = { final_approved: "Final (approved)", edited: "Edited", original: "Original", raw: "Original / RAW", deliverable: "Deliverable", revision: "Revision" };
const label = (k: string) => KIND_LABEL[k] ?? k.replace(/_/g, " ");
const isImage = (m: string | null, name: string) => Boolean(m?.startsWith("image/")) || /\.(jpe?g|png|webp|heic|tiff?)$/i.test(name);

export async function listPortfolioSourceFiles(filter: SourceFilter = {}, limit = 120): Promise<{ files: SourceFile[]; jobs: PortfolioJob[]; kinds: string[]; services: string[] }> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("project_files")
    .select("id, engagement_id, file_kind, original_filename, mime_type, release_status, retain, client_title, created_at")
    .is("purged_at", null)
    .order("created_at", { ascending: false })
    .limit(2000);
  const images = (rows ?? []).filter((r) => isImage(r.mime_type as string | null, r.original_filename as string));
  const engIds = [...new Set(images.map((r) => r.engagement_id as string))];
  const { data: engs } = engIds.length ? await admin.from("engagements").select("id, entity_type, entity_id").in("id", engIds) : { data: [] };
  const slotIds = (engs ?? []).filter((e) => e.entity_type === "crew_support_slot").map((e) => e.entity_id as string);
  const { data: slots } = slotIds.length ? await admin.from("crew_support_slots").select("id, request_id").in("id", slotIds) : { data: [] };
  const reqIds = [...new Set((slots ?? []).map((s) => s.request_id as string))];
  const { data: reqs } = reqIds.length ? await admin.from("crew_support_requests").select("id, reference_number, service_family, project_name, start_date, is_test").in("id", reqIds) : { data: [] };

  // A photograph belongs to exactly one job: a Crew Support request (all its slots together) or, otherwise, its own engagement.
  type J = { type: JobType; id: string; reference: string | null; title: string; service: string | null; date: string | null; test: boolean };
  const jobOf = (engagementId: string): J => {
    const eng = (engs ?? []).find((e) => e.id === engagementId);
    if (eng?.entity_type === "crew_support_slot") {
      const slot = (slots ?? []).find((s) => s.id === eng.entity_id);
      const req = slot ? (reqs ?? []).find((r) => r.id === slot.request_id) : null;
      if (req) return { type: "crew_support_request", id: req.id as string, reference: req.reference_number as string, title: `${req.reference_number as string} — ${(req.project_name as string | null) ?? "Crew Support job"}`, service: (req.service_family as string | null) ?? null, date: (req.start_date as string | null) ?? null, test: Boolean(req.is_test) };
    }
    return { type: "engagement", id: engagementId, reference: null, title: `${String(eng?.entity_type ?? "job").replace(/_/g, " ")} job`, service: null, date: null, test: false };
  };

  const all: SourceFile[] = images.map((r) => {
    const j = jobOf(r.engagement_id as string);
    return {
      id: r.id as string, filename: (r.client_title as string | null) || (r.original_filename as string), mimeType: (r.mime_type as string | null) ?? null, kind: r.file_kind as string, kindLabel: label(r.file_kind as string),
      releaseStatus: r.release_status as string, retained: Boolean(r.retain),
      jobKey: jobKey(j.type, j.id), jobType: j.type, jobId: j.id, jobLabel: j.title, jobReference: j.reference, service: j.service, isTest: j.test, clearance: "not_cleared" as const,
    };
  });

  const byJob = new Map<string, PortfolioJob>();
  images.forEach((r, i) => {
    const f = all[i];
    const j = jobOf(r.engagement_id as string);
    const cur = byJob.get(f.jobKey) ?? { key: f.jobKey, jobType: j.type, jobId: j.id, reference: j.reference, title: j.title, service: j.service, date: j.date, imageCount: 0, finalCount: 0, isTest: j.test };
    cur.imageCount += 1;
    if (f.kind === "final_approved") cur.finalCount += 1;
    if (!cur.date) cur.date = (r.created_at as string).slice(0, 10);
    byJob.set(f.jobKey, cur);
  });
  const jobs = [...byJob.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const q = filter.q?.trim().toLowerCase();
  const files = all
    .filter((f) => (!filter.kind || f.kind === filter.kind) && (!filter.service || f.service === filter.service) && (!filter.job || f.jobKey === filter.job) && (!filter.ids || filter.ids.includes(f.id)) && (!q || `${f.filename} ${f.jobLabel} ${f.kindLabel}`.toLowerCase().includes(q)))
    // Final images first: they carry the highest-end retouching.
    .sort((a, b) => Number(b.kind === "final_approved") - Number(a.kind === "final_approved"))
    .slice(0, limit);
  return { files, jobs, kinds: [...new Set(all.map((f) => f.kind))], services: [...new Set(all.map((f) => f.service).filter((x): x is string => Boolean(x)))] };
}
