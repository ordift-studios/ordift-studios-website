import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId } from "@/lib/organization/authority";

// Ordift Studios Compliance/COMP-SYS-1, Phase B6 Step 1 (2026-09-15) —
// Legal Entity / Operating-Jurisdiction foundation (migration 0105).
// Extends the existing employing_entities table rather than a new
// competing model. Every write here is Super-Admin-only — registration
// facts and evidence are foundational legal/compliance data, matching
// the "Super Admin only, no capability escape valve" tier already used
// for Background Screening and Speak-Up resolution elsewhere in this
// engagement.

async function requireSuperAdmin(actorUserId: string): Promise<boolean> {
  return isSuperAdminId(actorUserId);
}

export interface EmployingEntity {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  legalName: string | null;
  tradingName: string | null;
  jurisdictionId: string | null;
  jurisdictionName: string | null;
  registrationType: string | null;
  registrationDate: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  employerCapable: boolean;
  payrollJurisdictionId: string | null;
  payrollJurisdictionName: string | null;
  defaultCurrency: string | null;
  verificationStatus: "unverified" | "pending_review" | "verified";
  verifiedAt: string | null;
  verifiedBy: string | null;
}

const SELECT =
  "id, name, slug, active, legal_name, trading_name, jurisdiction_id, registration_type, registration_date, effective_from, effective_to, employer_capable, payroll_jurisdiction_id, default_currency, verification_status, verified_at, verified_by";

function mapRow(
  r: {
    id: string;
    name: string;
    slug: string;
    active: boolean;
    legal_name: string | null;
    trading_name: string | null;
    jurisdiction_id: string | null;
    registration_type: string | null;
    registration_date: string | null;
    effective_from: string | null;
    effective_to: string | null;
    employer_capable: boolean;
    payroll_jurisdiction_id: string | null;
    default_currency: string | null;
    verification_status: string;
    verified_at: string | null;
    verified_by: string | null;
  },
  jurisdictionNameById: Map<string, string>
): EmployingEntity {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    active: r.active,
    legalName: r.legal_name,
    tradingName: r.trading_name,
    jurisdictionId: r.jurisdiction_id,
    jurisdictionName: r.jurisdiction_id ? (jurisdictionNameById.get(r.jurisdiction_id) ?? null) : null,
    registrationType: r.registration_type,
    registrationDate: r.registration_date,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    employerCapable: r.employer_capable,
    payrollJurisdictionId: r.payroll_jurisdiction_id,
    payrollJurisdictionName: r.payroll_jurisdiction_id ? (jurisdictionNameById.get(r.payroll_jurisdiction_id) ?? null) : null,
    defaultCurrency: r.default_currency,
    verificationStatus: r.verification_status as EmployingEntity["verificationStatus"],
    verifiedAt: r.verified_at,
    verifiedBy: r.verified_by,
  };
}

export async function listEmployingEntities(): Promise<EmployingEntity[]> {
  const admin = createAdminClient();
  const [{ data: entities, error }, { data: jurisdictions }] = await Promise.all([
    admin.from("employing_entities").select(SELECT).order("sort_order", { ascending: true }),
    admin.from("employment_jurisdictions").select("id, name"),
  ]);
  if (error) {
    console.error("[organization] failed to load employing_entities", error.message);
    return [];
  }
  const jurisdictionNameById = new Map((jurisdictions ?? []).map((j) => [j.id, j.name]));
  return (entities ?? []).map((r) => mapRow(r, jurisdictionNameById));
}

export async function getEmployingEntityById(entityId: string): Promise<EmployingEntity | null> {
  const admin = createAdminClient();
  const [{ data: entity }, { data: jurisdictions }] = await Promise.all([
    admin.from("employing_entities").select(SELECT).eq("id", entityId).maybeSingle(),
    admin.from("employment_jurisdictions").select("id, name"),
  ]);
  if (!entity) return null;
  const jurisdictionNameById = new Map((jurisdictions ?? []).map((j) => [j.id, j.name]));
  return mapRow(entity, jurisdictionNameById);
}

// A new entity is a real, distinct registered business — never a
// duplicate/placeholder for an existing one. slug is derived from the
// legal name, matching the pre-existing seed convention (name
// "Ordift Studios" -> slug "ordift-studios").
export async function createEmployingEntity(params: {
  legalName: string;
  tradingName?: string | null;
  jurisdictionId?: string | null;
  registrationType?: string | null;
  registrationDate?: string | null;
  effectiveFrom?: string | null;
  defaultCurrency?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; entityId: string } | { ok: false; error: string }> {
  if (!(await requireSuperAdmin(params.actorUserId))) return { ok: false, error: "Not authorized to create a legal entity." };
  if (!params.legalName.trim()) return { ok: false, error: "A legal name is required." };

  const slug = params.legalName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  if (!slug) return { ok: false, error: "Could not derive a unique identifier from this legal name." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employing_entities")
    .insert({
      name: params.tradingName?.trim() || params.legalName.trim(),
      slug,
      legal_name: params.legalName.trim(),
      trading_name: params.tradingName?.trim() || null,
      jurisdiction_id: params.jurisdictionId ?? null,
      registration_type: params.registrationType ?? null,
      registration_date: params.registrationDate ?? null,
      effective_from: params.effectiveFrom ?? null,
      default_currency: params.defaultCurrency ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "An entity with this name already exists." };
    return { ok: false, error: error?.message ?? "Failed to create the legal entity." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "employing_entity.created", entityType: "employing_entity", entityId: data.id, metadata: { legalName: params.legalName } });
  return { ok: true, entityId: data.id };
}

export async function setEmployingEntityActive(params: { entityId: string; active: boolean; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireSuperAdmin(params.actorUserId))) return { ok: false, error: "Not authorized to change a legal entity's active status." };

  const admin = createAdminClient();
  const { error } = await admin.from("employing_entities").update({ active: params.active }).eq("id", params.entityId);
  if (error) return { ok: false, error: "Failed to update the entity's active status." };

  await logActivity({ actorUserId: params.actorUserId, action: "employing_entity.active_status_changed", entityType: "employing_entity", entityId: params.entityId, metadata: { active: params.active } });
  return { ok: true };
}

// The ONLY function that can set verification_status='verified' — always
// together with verified_at/verified_by, so a row can never claim
// verification without recording who performed it and when.
export async function verifyEmployingEntity(params: { entityId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireSuperAdmin(params.actorUserId))) return { ok: false, error: "Not authorized to verify a legal entity." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("employing_entities")
    .update({ verification_status: "verified", verified_at: new Date().toISOString(), verified_by: params.actorUserId })
    .eq("id", params.entityId);
  if (error) return { ok: false, error: "Failed to record verification." };

  await logActivity({ actorUserId: params.actorUserId, action: "employing_entity.verified", entityType: "employing_entity", entityId: params.entityId });
  return { ok: true };
}

export interface EmployingEntitySensitiveDetails {
  registrationNumber: string | null;
  taxIdentifier: string | null;
  registeredAddress: string | null;
}

// Restricted read — Super-Admin-only, matching the table's own RLS.
// Called only from a page/action that has already independently
// confirmed the caller is Super Admin; this is the second, real
// enforcement point (createAdminClient() bypasses RLS).
export async function getEmployingEntitySensitiveDetails(entityId: string, actorUserId: string): Promise<EmployingEntitySensitiveDetails | null> {
  if (!(await requireSuperAdmin(actorUserId))) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("employing_entity_sensitive_details")
    .select("registration_number, tax_identifier, registered_address")
    .eq("employing_entity_id", entityId)
    .maybeSingle();
  if (!data) return { registrationNumber: null, taxIdentifier: null, registeredAddress: null };
  return { registrationNumber: data.registration_number, taxIdentifier: data.tax_identifier, registeredAddress: data.registered_address };
}

export async function recordEmployingEntitySensitiveDetails(params: {
  entityId: string;
  registrationNumber?: string | null;
  taxIdentifier?: string | null;
  registeredAddress?: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireSuperAdmin(params.actorUserId))) return { ok: false, error: "Not authorized to record sensitive registration details." };

  const admin = createAdminClient();
  const { error } = await admin.from("employing_entity_sensitive_details").upsert(
    {
      employing_entity_id: params.entityId,
      registration_number: params.registrationNumber ?? null,
      tax_identifier: params.taxIdentifier ?? null,
      registered_address: params.registeredAddress ?? null,
      recorded_by: params.actorUserId,
    },
    { onConflict: "employing_entity_id" }
  );
  if (error) return { ok: false, error: "Failed to record the sensitive registration details." };

  await logActivity({ actorUserId: params.actorUserId, action: "employing_entity.sensitive_details_recorded", entityType: "employing_entity", entityId: params.entityId });
  return { ok: true };
}

const DOCUMENT_BUCKET = "legal-entity-documents";

export async function addEmployingEntityDocument(params: {
  entityId: string;
  documentType: string;
  file: File;
  notes?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; documentId: string } | { ok: false; error: string }> {
  if (!(await requireSuperAdmin(params.actorUserId))) return { ok: false, error: "Not authorized to upload a legal entity document." };
  if (!params.documentType.trim()) return { ok: false, error: "A document type is required." };

  const admin = createAdminClient();
  const path = `${params.entityId}/${Date.now()}-${params.file.name}`;
  const buffer = Buffer.from(await params.file.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(DOCUMENT_BUCKET).upload(path, buffer, { contentType: params.file.type });
  if (uploadError) {
    console.error("[organization] failed to upload legal entity document", uploadError.message);
    return { ok: false, error: "Failed to upload the file." };
  }

  const { data, error } = await admin
    .from("employing_entity_documents")
    .insert({ employing_entity_id: params.entityId, document_type: params.documentType, storage_path: path, notes: params.notes ?? null, uploaded_by: params.actorUserId })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "File uploaded but the document record failed to save." };

  await logActivity({ actorUserId: params.actorUserId, action: "employing_entity_document.uploaded", entityType: "employing_entity", entityId: params.entityId, metadata: { documentId: data.id, documentType: params.documentType } });
  return { ok: true, documentId: data.id };
}

export interface EmployingEntityDocument {
  id: string;
  documentType: string;
  notes: string | null;
  uploadedAt: string;
}

export async function listEmployingEntityDocuments(entityId: string, actorUserId: string): Promise<EmployingEntityDocument[]> {
  if (!(await requireSuperAdmin(actorUserId))) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employing_entity_documents")
    .select("id, document_type, notes, uploaded_at")
    .eq("employing_entity_id", entityId)
    .order("uploaded_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load employing_entity_documents", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ id: r.id, documentType: r.document_type, notes: r.notes, uploadedAt: r.uploaded_at }));
}

const SIGNED_URL_TTL_SECONDS = 300;

export async function getEmployingEntityDocumentSignedUrl(documentId: string, actorUserId: string): Promise<string | null> {
  if (!(await requireSuperAdmin(actorUserId))) return null;
  const admin = createAdminClient();
  const { data: row } = await admin.from("employing_entity_documents").select("employing_entity_id, storage_path").eq("id", documentId).maybeSingle();
  if (!row) return null;
  const { data, error } = await admin.storage.from(DOCUMENT_BUCKET).createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  await logActivity({ actorUserId, action: "employing_entity_document.viewed", entityType: "employing_entity", entityId: row.employing_entity_id, metadata: { documentId } });
  return data.signedUrl;
}

// Company-wide visibility: how many people's CURRENT employment terms
// point at each entity. Reduces employment_terms_history to the latest
// row per profile in application code (matching this codebase's
// established preference for straightforward two-step queries over a
// complex DISTINCT ON embed) — a zero count for a real entity is
// expected and accurate where most staff pre-date employment_terms_history
// ever being populated for them, not a bug.
export async function countActiveStaffByEmployingEntity(): Promise<Record<string, number>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employment_terms_history")
    .select("profile_id, employing_entity_id, effective_from, recorded_at")
    .order("effective_from", { ascending: false })
    .order("recorded_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load employment_terms_history for entity counts", error.message);
    return {};
  }
  const latestByProfile = new Map<string, string | null>();
  for (const row of data ?? []) {
    if (!latestByProfile.has(row.profile_id)) latestByProfile.set(row.profile_id, row.employing_entity_id);
  }
  const counts: Record<string, number> = {};
  for (const entityId of latestByProfile.values()) {
    if (!entityId) continue;
    counts[entityId] = (counts[entityId] ?? 0) + 1;
  }
  return counts;
}

// Same latest-row-per-profile reduction as countActiveStaffByEmployingEntity(),
// but returns the profile ids assigned to ONE specific entity, for that
// entity's own detail page ("see employees assigned to each entity").
export async function listProfileIdsForEmployingEntity(entityId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("employment_terms_history")
    .select("profile_id, employing_entity_id, effective_from, recorded_at")
    .order("effective_from", { ascending: false })
    .order("recorded_at", { ascending: false });
  if (error) {
    console.error("[organization] failed to load employment_terms_history for entity roster", error.message);
    return [];
  }
  const latestByProfile = new Map<string, string | null>();
  for (const row of data ?? []) {
    if (!latestByProfile.has(row.profile_id)) latestByProfile.set(row.profile_id, row.employing_entity_id);
  }
  return [...latestByProfile.entries()].filter(([, id]) => id === entityId).map(([profileId]) => profileId);
}
