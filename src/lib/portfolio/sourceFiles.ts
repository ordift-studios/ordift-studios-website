import { createAdminClient } from "@/lib/supabase/admin";

// READ-ONLY browse of photographs already stored for jobs (project_files), for the internal Quick Portfolio Picker. It points at the source files
// and copies nothing. Marketing clearance is not recorded anywhere in the platform yet, so EVERY photograph is reported as not cleared; a later,
// separately authorised migration adds per-image clearance (see supabase/proposals/PROPOSED_portfolio_library.sql). Callers must be management users.

export type SourceFile = {
  id: string; filename: string; mimeType: string | null; kind: string; kindLabel: string; releaseStatus: string; retained: boolean;
  jobLabel: string; jobReference: string | null; service: string | null; isTest: boolean; clearance: "not_cleared";
};
export type SourceFilter = { q?: string; kind?: string; service?: string };

const KIND_LABEL: Record<string, string> = { final_approved: "Final (approved)", edited: "Edited", original: "Original", raw: "Original / RAW" };
const label = (k: string) => KIND_LABEL[k] ?? k.replace(/_/g, " ");
const isImage = (m: string | null, name: string) => Boolean(m?.startsWith("image/")) || /\.(jpe?g|png|webp|heic|tiff?)$/i.test(name);

export async function listPortfolioSourceFiles(filter: SourceFilter = {}, limit = 120): Promise<{ files: SourceFile[]; kinds: string[]; services: string[] }> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("project_files")
    .select("id, engagement_id, file_kind, original_filename, mime_type, release_status, retain, client_title")
    .is("purged_at", null)
    .order("created_at", { ascending: false })
    .limit(1000);
  const images = (rows ?? []).filter((r) => isImage(r.mime_type as string | null, r.original_filename as string));
  const engIds = [...new Set(images.map((r) => r.engagement_id as string))];
  const { data: engs } = engIds.length ? await admin.from("engagements").select("id, entity_type, entity_id").in("id", engIds) : { data: [] };
  const slotIds = (engs ?? []).filter((e) => e.entity_type === "crew_support_slot").map((e) => e.entity_id as string);
  const { data: slots } = slotIds.length ? await admin.from("crew_support_slots").select("id, request_id").in("id", slotIds) : { data: [] };
  const reqIds = [...new Set((slots ?? []).map((s) => s.request_id as string))];
  const { data: reqs } = reqIds.length ? await admin.from("crew_support_requests").select("id, reference_number, service_family, project_name, is_test").in("id", reqIds) : { data: [] };

  const jobOf = (engagementId: string) => {
    const eng = (engs ?? []).find((e) => e.id === engagementId);
    if (!eng) return { label: "Job (unlinked)", ref: null, service: null, test: false };
    if (eng.entity_type === "crew_support_slot") {
      const slot = (slots ?? []).find((s) => s.id === eng.entity_id);
      const req = slot ? (reqs ?? []).find((r) => r.id === slot.request_id) : null;
      if (req) return { label: `${req.reference_number as string} — ${(req.project_name as string | null) ?? "Crew Support job"}`, ref: req.reference_number as string, service: (req.service_family as string | null) ?? null, test: Boolean(req.is_test) };
    }
    return { label: `${String(eng.entity_type).replace(/_/g, " ")} job`, ref: null, service: null, test: false };
  };

  const all: SourceFile[] = images.map((r) => {
    const j = jobOf(r.engagement_id as string);
    return {
      id: r.id as string, filename: (r.client_title as string | null) || (r.original_filename as string), mimeType: (r.mime_type as string | null) ?? null, kind: r.file_kind as string, kindLabel: label(r.file_kind as string),
      releaseStatus: r.release_status as string, retained: Boolean(r.retain), jobLabel: j.label, jobReference: j.ref, service: j.service, isTest: j.test, clearance: "not_cleared" as const,
    };
  });
  const q = filter.q?.trim().toLowerCase();
  const files = all
    .filter((f) => (!filter.kind || f.kind === filter.kind) && (!filter.service || f.service === filter.service) && (!q || `${f.filename} ${f.jobLabel} ${f.kindLabel}`.toLowerCase().includes(q)))
    // Final images first: they carry the highest-end retouching.
    .sort((a, b) => Number(b.kind === "final_approved") - Number(a.kind === "final_approved"))
    .slice(0, limit);
  return { files, kinds: [...new Set(all.map((f) => f.kind))], services: [...new Set(all.map((f) => f.service).filter((x): x is string => Boolean(x)))] };
}
