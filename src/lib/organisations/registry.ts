import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeWithSuperAdminOverride, STRATEGY_CAPABILITIES } from "@/lib/organization/authority";
import { logActivity } from "@/lib/admin/activityLog";
import { matchOrganisations, normaliseDomain, normaliseOrganisationName, type OrganisationCandidate, type OrganisationMatch } from "./names";
import { excerptOf, MAX_PASTE_CHARS, normalisedForHash, parseApprovalEmail } from "./approvalEmail";
import { assessApproval, ORDIFT_OWN_DOMAINS, planConfirmation, relationshipWrite, type ApprovalSignal, type MatchLevel } from "./approvalSignals";

// Organisation registry and supplier-approval confirmation (v1). Server-only.
//
//   Supplier application recorded -> approval email pasted by a person -> matched to the application and to the organisation
//   directory -> an administrator confirms -> the organisation's CLIENT relationship is created or moved to approved.
//
// Rules this module keeps (and src/lib/organisations/registry.test.ts checks by reading this file):
//   * Nothing reads a mailbox. An email exists here only because a person pasted it into the Admin form.
//   * An email never changes a record by itself: only confirmApproval() does, and only for an authorised administrator.
//   * Confirming an approval records a relationship. It never creates, links or changes a booking, quotation, invoice,
//     payable, payment or any other financial record.
//   * "client" means the organisation approved Ordift as ITS supplier. It is not the vendor/production-supplier directory
//     (organisations that supply services TO Ordift), which this module does not touch.

async function authorize(actorUserId: string) {
  return authorizeWithSuperAdminOverride(actorUserId, STRATEGY_CAPABILITIES.organisationRegistryAdminister);
}
const NOT_AUTHORISED = "Not authorised to manage the organisation registry.";

export type ApplicationStatus = "submitted" | "pending_confirmation" | "approved" | "declined" | "withdrawn";
export type RelationshipKind = "client" | "vendor";
export type RelationshipStatus = "prospect" | "approved" | "inactive";

export type OrganisationRow = {
  id: string;
  name: string;
  primaryDomain: string | null;
  status: "active" | "inactive";
  notes: string | null;
  createdAt: string;
  relationships: { kind: RelationshipKind; status: RelationshipStatus; approvedAt: string | null; sourceApplicationId: string | null }[];
};

export type ApplicationRow = {
  id: string;
  organisationName: string;
  contactDomain: string | null;
  reference: string | null;
  submittedOn: string;
  submissionNotes: string | null;
  status: ApplicationStatus;
  organisationId: string | null;
  organisationLabel: string | null;
  approvalSenderDomain: string | null;
  approvalSubject: string | null;
  approvalSentOn: string | null;
  approvalExcerpt: string | null;
  approvalMatchLevel: MatchLevel | null;
  approvalSignals: ApprovalSignal[] | null;
  approvalSubmittedAt: string | null;
  confirmedAt: string | null;
  confirmationNote: string | null;
  createdAt: string;
};

const APPLICATION_SELECT =
  "id, organisation_name, contact_domain, reference, submitted_on, submission_notes, status, organisation_id, approval_sender_domain, approval_subject, approval_sent_on, approval_excerpt, approval_match_level, approval_signals, approval_submitted_at, confirmed_at, confirmation_note, created_at, organisations(name)";

type RawApplication = {
  id: string;
  organisation_name: string;
  contact_domain: string | null;
  reference: string | null;
  submitted_on: string;
  submission_notes: string | null;
  status: string;
  organisation_id: string | null;
  approval_sender_domain: string | null;
  approval_subject: string | null;
  approval_sent_on: string | null;
  approval_excerpt: string | null;
  approval_match_level: string | null;
  approval_signals: unknown;
  approval_submitted_at: string | null;
  confirmed_at: string | null;
  confirmation_note: string | null;
  created_at: string;
  organisations: { name: string } | { name: string }[] | null;
};

function mapApplication(r: RawApplication): ApplicationRow {
  const org = Array.isArray(r.organisations) ? r.organisations[0] : r.organisations;
  return {
    id: r.id,
    organisationName: r.organisation_name,
    contactDomain: r.contact_domain,
    reference: r.reference,
    submittedOn: r.submitted_on,
    submissionNotes: r.submission_notes,
    status: r.status as ApplicationStatus,
    organisationId: r.organisation_id,
    organisationLabel: org?.name ?? null,
    approvalSenderDomain: r.approval_sender_domain,
    approvalSubject: r.approval_subject,
    approvalSentOn: r.approval_sent_on,
    approvalExcerpt: r.approval_excerpt,
    approvalMatchLevel: r.approval_match_level as MatchLevel | null,
    approvalSignals: Array.isArray(r.approval_signals) ? (r.approval_signals as ApprovalSignal[]) : null,
    approvalSubmittedAt: r.approval_submitted_at,
    confirmedAt: r.confirmed_at,
    confirmationNote: r.confirmation_note,
    createdAt: r.created_at,
  };
}

// ---- Reads ---------------------------------------------------------------------------------------------------------

export async function listOrganisations(actorUserId: string): Promise<OrganisationRow[]> {
  if (!(await authorize(actorUserId)).ok) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organisations")
    .select("id, name, primary_domain, status, notes, created_at, organisation_relationships(kind, status, approved_at, source_application_id)")
    .order("name");
  if (error) {
    console.error("[organisations] failed to load organisations", error.message);
    return [];
  }
  return (data ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    primaryDomain: o.primary_domain,
    status: o.status,
    notes: o.notes,
    createdAt: o.created_at,
    relationships: ((o.organisation_relationships ?? []) as { kind: RelationshipKind; status: RelationshipStatus; approved_at: string | null; source_application_id: string | null }[]).map((r) => ({
      kind: r.kind,
      status: r.status,
      approvedAt: r.approved_at,
      sourceApplicationId: r.source_application_id,
    })),
  }));
}

export async function listApplications(actorUserId: string, filter?: { status?: ApplicationStatus }): Promise<ApplicationRow[]> {
  if (!(await authorize(actorUserId)).ok) return [];
  const admin = createAdminClient();
  let q = admin.from("supplier_applications").select(APPLICATION_SELECT).order("submitted_on", { ascending: false });
  if (filter?.status) q = q.eq("status", filter.status);
  const { data, error } = await q;
  if (error) {
    console.error("[organisations] failed to load applications", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapApplication(r as unknown as RawApplication));
}

export async function getApplication(actorUserId: string, id: string): Promise<ApplicationRow | null> {
  if (!(await authorize(actorUserId)).ok) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.from("supplier_applications").select(APPLICATION_SELECT).eq("id", id).maybeSingle();
  if (error || !data) {
    if (error) console.error("[organisations] failed to load application", error.message);
    return null;
  }
  return mapApplication(data as unknown as RawApplication);
}

async function loadCandidates(): Promise<OrganisationCandidate[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("organisations").select("id, name, primary_domain").limit(5000);
  if (error) {
    console.error("[organisations] failed to load directory for matching", error.message);
    return [];
  }
  return (data ?? []).map((o) => ({ id: o.id, name: o.name, primaryDomain: o.primary_domain }));
}

// Existing organisations that look like the given name/domain, best first. Used to show a person what already exists
// before anything is created, and to pre-select the likely organisation on the confirmation form.
export async function findOrganisationMatches(actorUserId: string, query: { name: string; domain?: string | null }): Promise<OrganisationMatch[]> {
  if (!(await authorize(actorUserId)).ok) return [];
  return matchOrganisations(await loadCandidates(), query);
}

// ---- Record a supplier application ---------------------------------------------------------------------------------

export async function recordApplication(params: {
  organisationName: string;
  contactDomain?: string | null;
  reference?: string | null;
  submittedOn: string;
  notes?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(await authorize(params.actorUserId)).ok) return { ok: false, error: NOT_AUTHORISED };
  const name = params.organisationName.trim();
  if (!name || name.length > 200) return { ok: false, error: "Enter the organisation's name (up to 200 characters)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.submittedOn)) return { ok: false, error: "Enter the date the application was submitted." };
  if (params.submittedOn > new Date().toISOString().slice(0, 10)) return { ok: false, error: "The submission date cannot be in the future." };
  const rawDomain = params.contactDomain?.trim() || null;
  const contactDomain = normaliseDomain(rawDomain);
  if (rawDomain && !contactDomain) return { ok: false, error: "That is not a valid domain. Use the organisation's own domain, for example example.com." };
  const reference = params.reference?.trim() || null;
  const normalized = normaliseOrganisationName(name);
  if (!normalized) return { ok: false, error: "Enter the organisation's name." };

  const admin = createAdminClient();
  // The same organisation, with the same reference, may have only one application open at a time.
  let dup = admin.from("supplier_applications").select("id").eq("normalized_name", normalized).in("status", ["submitted", "pending_confirmation"]);
  dup = reference ? dup.eq("reference", reference) : dup.is("reference", null);
  const { data: existing } = await dup.limit(1);
  if (existing && existing.length > 0) return { ok: false, error: "An application for this organisation (with the same reference) is already open. Open it instead of recording another." };

  // If the organisation is already registered, link the application now; otherwise it is linked or created at confirmation.
  const matches = matchOrganisations(await loadCandidates(), { name, domain: contactDomain });
  const exact = matches.find((m) => m.strength === "exact");

  const { data, error } = await admin
    .from("supplier_applications")
    .insert({
      organisation_name: name,
      normalized_name: normalized,
      contact_domain: contactDomain,
      reference,
      submitted_on: params.submittedOn,
      submission_notes: params.notes?.trim() || null,
      status: "submitted",
      organisation_id: exact?.organisation.id ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("[organisations] failed to record application", error?.message);
    return { ok: false, error: "Failed to record the application." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "organisations.application.recorded", entityType: "supplier_application", entityId: data.id, metadata: { organisationName: name, linkedExisting: Boolean(exact) } });
  return { ok: true, id: data.id };
}

// ---- Attach a pasted approval email --------------------------------------------------------------------------------

export async function submitApprovalEmail(params: {
  applicationId: string;
  rawText: string;
  senderAddress?: string | null;
  actorUserId: string;
}): Promise<{ ok: true; level: MatchLevel } | { ok: false; error: string }> {
  if (!(await authorize(params.actorUserId)).ok) return { ok: false, error: NOT_AUTHORISED };
  const raw = params.rawText.trim();
  if (raw.length < 20) return { ok: false, error: "Paste the approval email (with its headers if you can)." };
  if (raw.length > MAX_PASTE_CHARS) return { ok: false, error: "That is too long to be a single email. Paste only the approval message." };

  const admin = createAdminClient();
  const { data: app, error: loadError } = await admin
    .from("supplier_applications")
    .select("id, status, reference, organisation_name, contact_domain, submitted_on, organisation_id, organisations(name, primary_domain)")
    .eq("id", params.applicationId)
    .maybeSingle();
  if (loadError || !app) return { ok: false, error: "Application not found." };
  if (app.status !== "submitted" && app.status !== "pending_confirmation") return { ok: false, error: "This application is already closed, so an approval email cannot be attached." };

  const linked = (Array.isArray(app.organisations) ? app.organisations[0] : app.organisations) as { name: string; primary_domain: string | null } | null;
  const parsed = parseApprovalEmail(raw, { senderAddress: params.senderAddress ?? null, ownDomains: ORDIFT_OWN_DOMAINS });
  const { signals, level } = assessApproval(
    { reference: app.reference, organisationName: app.organisation_name, contactDomain: app.contact_domain, submittedOn: app.submitted_on, linkedOrganisation: linked ? { name: linked.name, primaryDomain: linked.primary_domain } : null },
    parsed
  );
  const sha = createHash("sha256").update(normalisedForHash(raw)).digest("hex");

  // The same email cannot be attached to two applications (or twice).
  const { data: sameEmail } = await admin.from("supplier_applications").select("id").eq("approval_text_sha256", sha).neq("id", app.id).limit(1);
  if (sameEmail && sameEmail.length > 0) return { ok: false, error: "This email has already been attached to another application." };

  const { error } = await admin
    .from("supplier_applications")
    .update({
      status: "pending_confirmation",
      approval_sender_domain: parsed.senderDomain,
      approval_subject: parsed.subject ? parsed.subject.slice(0, 300) : null,
      approval_sent_on: parsed.sentOn,
      approval_spf: parsed.spf,
      approval_dkim: parsed.dkim,
      approval_dmarc: parsed.dmarc,
      approval_dkim_aligned: parsed.dkimAligned,
      approval_excerpt: excerptOf(parsed.bodyText),
      approval_text_sha256: sha,
      approval_match_level: level,
      approval_signals: signals,
      approval_submitted_by: params.actorUserId,
      approval_submitted_at: new Date().toISOString(),
    })
    .eq("id", app.id)
    .in("status", ["submitted", "pending_confirmation"]);
  if (error) {
    console.error("[organisations] failed to attach approval email", error.message);
    return { ok: false, error: "Failed to attach the email." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "organisations.approval_email.attached", entityType: "supplier_application", entityId: app.id, metadata: { level, senderDomain: parsed.senderDomain, hasHeaders: parsed.hasHeaders } });
  return { ok: true, level };
}

// Set the attached email aside (not genuine, wrong application, pasted by mistake). The application goes back to "submitted".
export async function discardApprovalEmail(params: { applicationId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await authorize(params.actorUserId)).ok) return { ok: false, error: NOT_AUTHORISED };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("supplier_applications")
    .update({
      status: "submitted",
      approval_sender_domain: null, approval_subject: null, approval_sent_on: null, approval_spf: null, approval_dkim: null, approval_dmarc: null,
      approval_dkim_aligned: null, approval_excerpt: null, approval_text_sha256: null, approval_match_level: null, approval_signals: null,
      approval_submitted_by: null, approval_submitted_at: null,
    })
    .eq("id", params.applicationId)
    .eq("status", "pending_confirmation")
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "There is no attached email to set aside on this application." };
  await logActivity({ actorUserId: params.actorUserId, action: "organisations.approval_email.discarded", entityType: "supplier_application", entityId: params.applicationId, metadata: {} });
  return { ok: true };
}

// ---- Confirm: the only step that creates or updates an organisation relationship -----------------------------------

export async function confirmApproval(params: {
  applicationId: string;
  organisationChoice: { kind: "existing"; organisationId: string } | { kind: "new"; name: string; domain: string | null };
  acknowledgedReview: boolean;
  confirmedDistinct: boolean;
  note: string;
  actorUserId: string;
}): Promise<{ ok: true; organisationId: string; created: boolean } | { ok: false; error: string }> {
  if (!(await authorize(params.actorUserId)).ok) return { ok: false, error: NOT_AUTHORISED };
  const admin = createAdminClient();

  const { data: app, error: loadError } = await admin
    .from("supplier_applications")
    .select("id, status, approval_match_level, approval_text_sha256")
    .eq("id", params.applicationId)
    .maybeSingle();
  if (loadError || !app) return { ok: false, error: "Application not found." };
  if (app.status !== "pending_confirmation") return { ok: false, error: "Only an application with an attached approval email can be confirmed." };
  const level = (app.approval_match_level ?? "weak") as MatchLevel;

  const newChoice = params.organisationChoice.kind === "new" ? params.organisationChoice : null;
  const newDomain = newChoice ? normaliseDomain(newChoice.domain) : null;
  if (newChoice && newChoice.domain && !newDomain) return { ok: false, error: "That is not a valid domain." };
  const matchesForNew = newChoice ? matchOrganisations(await loadCandidates(), { name: newChoice.name, domain: newDomain }) : [];

  const plan = planConfirmation({ level, organisationChoice: newChoice ? { kind: "new", name: newChoice.name, domain: newDomain } : params.organisationChoice, matchesForNew, acknowledgedReview: params.acknowledgedReview, confirmedDistinct: params.confirmedDistinct, note: params.note });
  if (!plan.ok) return plan;

  // 1. The organisation: link an existing one, or create it (the database refuses an exact normalised-name duplicate).
  let organisationId: string;
  let created = false;
  if (plan.mode === "link_existing" && params.organisationChoice.kind === "existing") {
    const { data: org } = await admin.from("organisations").select("id, status").eq("id", params.organisationChoice.organisationId).maybeSingle();
    if (!org) return { ok: false, error: "That organisation no longer exists." };
    organisationId = org.id;
  } else if (newChoice) {
    const { data: org, error } = await admin
      .from("organisations")
      .insert({ name: newChoice.name.trim(), normalized_name: normaliseOrganisationName(newChoice.name), primary_domain: newDomain, created_by: params.actorUserId })
      .select("id")
      .maybeSingle();
    if (error || !org) {
      console.error("[organisations] failed to create organisation", error?.message);
      return { ok: false, error: error?.code === "23505" ? "An organisation with this name is already registered. Choose it instead." : "Failed to create the organisation." };
    }
    organisationId = org.id;
    created = true;
  } else {
    return { ok: false, error: "Choose the organisation." };
  }

  // 2. The client relationship: created or moved to approved; an existing approval date is never rewritten.
  const now = new Date().toISOString();
  const { data: rel } = await admin.from("organisation_relationships").select("id, status, approved_at").eq("organisation_id", organisationId).eq("kind", "client").maybeSingle();
  const write = relationshipWrite(rel ? { status: rel.status, approvedAt: rel.approved_at } : null, now);
  const relError =
    write.action === "insert"
      ? (await admin.from("organisation_relationships").insert({ organisation_id: organisationId, kind: "client", status: "approved", approved_at: write.approvedAt, source_application_id: params.applicationId, created_by: params.actorUserId })).error
      : (await admin.from("organisation_relationships").update({ status: "approved", approved_at: write.approvedAt, source_application_id: params.applicationId }).eq("id", rel!.id)).error;
  if (relError) {
    console.error("[organisations] failed to record client relationship", relError.message);
    return { ok: false, error: "Failed to record the relationship. Nothing was confirmed; you can try again." };
  }

  // 3. Close the application. Compare-and-set on status so two people confirming at once cannot both succeed; steps 1 and 2
  //    are idempotent, so a retry after a failure here is safe.
  const { data: closed, error: closeError } = await admin
    .from("supplier_applications")
    .update({ status: "approved", organisation_id: organisationId, confirmed_by: params.actorUserId, confirmed_at: now, confirmation_note: params.note.trim() || null, acknowledged_review: params.acknowledgedReview })
    .eq("id", params.applicationId)
    .eq("status", "pending_confirmation")
    .select("id")
    .maybeSingle();
  if (closeError || !closed) {
    console.error("[organisations] failed to close application", closeError?.message);
    return { ok: false, error: "The application was changed by someone else, or could not be closed. Reload and check its status." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "organisations.approval.confirmed", entityType: "supplier_application", entityId: params.applicationId, metadata: { organisationId, createdOrganisation: created, level, acknowledgedReview: params.acknowledgedReview } });
  return { ok: true, organisationId, created };
}

// ---- Close without approval ----------------------------------------------------------------------------------------

export async function closeApplication(params: { applicationId: string; outcome: "declined" | "withdrawn"; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await authorize(params.actorUserId)).ok) return { ok: false, error: NOT_AUTHORISED };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("supplier_applications")
    .update({ status: params.outcome })
    .eq("id", params.applicationId)
    .in("status", ["submitted", "pending_confirmation"])
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Only an open application can be closed." };
  await logActivity({ actorUserId: params.actorUserId, action: `organisations.application.${params.outcome}`, entityType: "supplier_application", entityId: params.applicationId, metadata: {} });
  return { ok: true };
}
