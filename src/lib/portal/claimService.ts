import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, hasRole, isStaffOrAdmin, isSuperAdmin } from "@/lib/portal/roles";
import { logActivityAsSystem } from "@/lib/admin/activityLog";
import { checkRateLimit } from "@/lib/shared/rateLimit";
import { isPlaceholderEmail } from "@/lib/shared/email/placeholder";
import { siteUrl } from "@/lib/shared/env";
import { assessClaimRisk, claimUrl, clampExpiryDays, clientMessage, codeMessage, deliveryAdvice, hashCode, hashToken, invitationMessage, isClaimChannel, isPlausibleToken, newCode, newToken, normaliseCode, type ClaimOutcome, type Risk } from "@/lib/portal/claims";

// PORTAL CLAIMS - server side (LOCAL build; needs PROPOSAL_portal_claims.sql in the database). Server-only.
//  * Creating an invitation: signed-in STAFF or admin only (never the client, never a stranger). The link token and the code are shown ONCE to the person who created them; only hashes are stored.
//  * Claiming: only a signed-in NON-STAFF account, with the link and the right code, within the expiry, within 5 tries, on a record nobody owns. The database does the attaching, atomically.
//  * Every step is audited (activity log) and the database keeps its own ownership-event history. A creation that cannot be audited is cancelled and nothing is issued.
//  * Nothing here matches on an email address or a telephone number. Those only raise the care staff are told to take.
type Fail = { ok: false; error: string };
const NOT_AUTHORISED = "Only staff can issue a portal invitation.";
const SAFE = "The invitation could not be created. Nothing was issued.";

async function authorisedStaff(actorUserId: string) {
  const user = await getCurrentUser();
  return user && user.id === actorUserId && isStaffOrAdmin(user) ? user : null;
}
async function auditStrict(actorUserId: string, action: string, entityId: string, metadata: Record<string, unknown>): Promise<boolean> {
  const { error } = await createAdminClient().from("activity_log").insert({ actor_user_id: actorUserId, action, entity_type: "enquiry", entity_id: entityId, metadata });
  if (error) { console.error("[portal-claim] audit write failed", action, error.message); return false; }
  return true;
}

export type CreatedInvitation = { ok: true; link: string; code: string; expiresAt: string; risk: Risk; advice: string; invitationText: string; codeText: string; claimId: string };
export async function createClaimInvitation(params: { actorUserId: string; enquiryId: string; channel: string; note: string; expiresInDays: number }): Promise<CreatedInvitation | Fail> {
  const user = await authorisedStaff(params.actorUserId);
  if (!user) return { ok: false, error: NOT_AUTHORISED };
  if (!isClaimChannel(params.channel)) return { ok: false, error: "Say how you will give this to the client (WhatsApp, telephone, email or in person)." };
  if (params.note.length > 300) return { ok: false, error: "Keep the note under 300 characters." };
  if (!(await checkRateLimit(`claim-create:${user.id}`)).allowed) return { ok: false, error: "Too many invitations in a short time. Wait a few minutes and try again." };
  const admin = createAdminClient();
  const { data: enq } = await admin.from("enquiries").select("id, reference_number, full_name, email, user_id, contact_id").eq("id", params.enquiryId).maybeSingle();
  if (!enq) return { ok: false, error: "Enquiry not found." };
  if (enq.user_id) return { ok: false, error: "This project is already linked to a client's portal account." };

  const email = (enq.email as string | null) ?? null; const placeholder = isPlaceholderEmail(email);
  let shared = false; let others = 0; let ownedByAccount = false;
  if (email && !placeholder) {
    const { data: sh } = await admin.from("contact_emails").select("id").ilike("email", email).eq("is_shared", true).is("removed_at", null).limit(1);
    shared = (sh ?? []).length > 0;
    const { count: n } = await admin.from("enquiries").select("id", { count: "exact", head: true }).ilike("email", email).neq("id", enq.id as string);
    others = n ?? 0;
    const { count: o } = await admin.from("enquiries").select("id", { count: "exact", head: true }).ilike("email", email).not("user_id", "is", null);
    ownedByAccount = (o ?? 0) > 0;
  }
  const risk = assessClaimRisk({ email, emailIsPlaceholder: placeholder, emailIsSharedInDirectory: shared, otherEnquiriesWithEmail: others, emailAlreadyOwnedByAnAccount: ownedByAccount, hasDirectoryContact: Boolean(enq.contact_id) });

  const token = newToken(); const code = newCode(); const expiresAt = new Date(Date.now() + clampExpiryDays(params.expiresInDays) * 86_400_000).toISOString();
  const { data, error } = await admin.rpc("create_portal_claim", { p_enquiry: enq.id, p_creator: user.id, p_channel: params.channel, p_note: params.note.trim() || null, p_token_hash: hashToken(token), p_code_hash: hashCode(token, code), p_expires_at: expiresAt, p_risk_level: risk.level, p_risk_reasons: risk.reasons });
  if (error) { console.error("[portal-claim] create failed", error.message); return { ok: false, error: SAFE }; }
  const r = (data ?? {}) as { outcome?: string; claim_id?: string };
  if (r.outcome === "already_owned") return { ok: false, error: "This project is already linked to a client's portal account." };
  if (r.outcome === "open_claim_exists") return { ok: false, error: "An invitation for this project is already open. Revoke it first if you need a new one (a code can't be shown again)." };
  if (r.outcome !== "created" || !r.claim_id) return { ok: false, error: SAFE };

  const audited = await auditStrict(user.id, "enquiry.portal_claim_created", enq.id as string, { claimId: r.claim_id, channel: params.channel, expiresAt, riskLevel: risk.level, riskReasons: risk.reasons.length, noteGiven: params.note.trim().length > 0 });
  if (!audited) {
    await admin.rpc("revoke_portal_claim", { p_claim: r.claim_id, p_actor: user.id, p_reason: "audit_failed" });
    return { ok: false, error: "The invitation could not be recorded, so it was cancelled. Nothing was issued. Try again." };
  }
  const link = claimUrl(siteUrl(), token);
  return { ok: true, claimId: r.claim_id, link, code, expiresAt, risk, advice: deliveryAdvice(params.channel, risk.level), invitationText: invitationMessage({ name: (enq.full_name as string | null) ?? null, reference: enq.reference_number as string, link }), codeText: codeMessage(code) };
}

export type ClaimResult = { ok: boolean; outcome: ClaimOutcome | "not_signed_in"; message: string; enquiryId?: string; attemptsLeft?: number };
export async function attemptClaim(params: { claimerUserId: string; token: string; codeInput: string }): Promise<ClaimResult> {
  const user = await getCurrentUser();
  if (!user || user.id !== params.claimerUserId) return { ok: false, outcome: "not_signed_in", message: "Sign in to your own account first." };
  const code = normaliseCode(params.codeInput);
  if (!isPlausibleToken(params.token)) return { ok: false, outcome: "not_found", message: clientMessage("not_found") };
  if (!code) return { ok: false, outcome: "invalid_input", message: clientMessage("invalid_input") };
  if (!(await checkRateLimit(`claim-attempt:${user.id}`)).allowed) {
    await logActivityAsSystem({ actorUserId: user.id, action: "enquiry.portal_claim_failed", entityType: "portal_claim", metadata: { reason: "rate_limited" } });
    return { ok: false, outcome: "rate_limited", message: clientMessage("rate_limited") };
  }
  const { data, error } = await createAdminClient().rpc("attempt_portal_claim", { p_token_hash: hashToken(params.token), p_code_hash: hashCode(params.token, code), p_claimer: user.id });
  if (error) { console.error("[portal-claim] attempt failed", error.message); return { ok: false, outcome: "not_found", message: "Something went wrong. Please try again, or ask ORDIFT STUDIOS for help." }; }
  const r = (data ?? {}) as { outcome?: string; enquiry_id?: string; claim_id?: string; attempts_left?: number; reason?: string };
  const outcome = (r.outcome ?? "not_found") as ClaimOutcome;
  const success = outcome === "claimed" || outcome === "already_yours";
  await logActivityAsSystem({ actorUserId: user.id, action: success ? (outcome === "claimed" ? "enquiry.portal_claim_succeeded" : "enquiry.portal_claim_repeated") : "enquiry.portal_claim_failed", entityType: "enquiry", entityId: r.enquiry_id ?? undefined, metadata: { outcome, claimId: r.claim_id ?? null, attemptsLeft: r.attempts_left ?? null, reason: r.reason ?? null } });
  // Only a successful claim ever sees the project; every other outcome returns a message and nothing about the record.
  return { ok: success, outcome, message: clientMessage(outcome, r.attempts_left, r.reason), enquiryId: success ? r.enquiry_id : undefined, attemptsLeft: outcome === "bad_code" ? r.attempts_left : undefined };
}

export async function revokeClaimInvitation(params: { actorUserId: string; claimId: string; reason: string }): Promise<{ ok: true } | Fail> {
  const user = await authorisedStaff(params.actorUserId);
  if (!user) return { ok: false, error: NOT_AUTHORISED };
  const { data, error } = await createAdminClient().rpc("revoke_portal_claim", { p_claim: params.claimId, p_actor: user.id, p_reason: params.reason.trim() || "revoked by staff" });
  if (error) return { ok: false, error: /actor_not_authorized/.test(error.message) ? "Only the person who issued it, or an admin, can revoke an invitation." : "The invitation could not be revoked. Nothing was changed." };
  const r = (data ?? {}) as { outcome?: string; enquiry_id?: string };
  if (r.outcome !== "revoked") return { ok: false, error: "That invitation is no longer open." };
  await logActivityAsSystem({ actorUserId: user.id, action: "enquiry.portal_claim_revoked", entityType: "enquiry", entityId: r.enquiry_id, metadata: { claimId: params.claimId, reason: params.reason.trim() || null } });
  return { ok: true };
}

export async function releasePortalOwnership(params: { actorUserId: string; enquiryId: string; reason: string }): Promise<{ ok: true } | Fail> {
  const user = await getCurrentUser();
  if (!user || user.id !== params.actorUserId || !isSuperAdmin(user)) return { ok: false, error: "Only a Super Admin can release a project from a client's account." };
  if (params.reason.trim().length < 10) return { ok: false, error: "Write why (at least a short sentence)." };
  const { data, error } = await createAdminClient().rpc("release_enquiry_ownership", { p_enquiry: params.enquiryId, p_actor: user.id, p_reason: params.reason.trim() });
  if (error) return { ok: false, error: /payments_exist/.test(error.message) ? "A payment has been made, or is awaiting verification, on this project. Resolve it first: ownership can't be released while money is involved." : "Ownership could not be released. Nothing was changed." };
  const r = (data ?? {}) as { outcome?: string };
  if (r.outcome !== "released") return { ok: false, error: "This project is not linked to a client's account." };
  await logActivityAsSystem({ actorUserId: user.id, action: "enquiry.portal_ownership_released", entityType: "enquiry", entityId: params.enquiryId, metadata: { reason: params.reason.trim() } });
  return { ok: true };
}

export type PortalAccessView = {
  owner: { label: string } | null;
  invitations: { id: string; status: string; channel: string; createdAt: string; expiresAt: string; attempts: number; riskLevel: string; createdByLabel: string | null; canRevoke: boolean }[];
  events: { event: string; at: string; actorLabel: string | null; reason: string | null }[];
  tableMissing: boolean;
  sourceChannel: string | null;
};
// Audit identity standard: the member number is the authoritative label, never a bare name.
export async function loadPortalAccess(enquiryId: string, viewerId: string): Promise<PortalAccessView> {
  const admin = createAdminClient();
  const { data: enq } = await admin.from("enquiries").select("user_id, source_channel").eq("id", enquiryId).maybeSingle();
  const ids = new Set<string>(); if (enq?.user_id) ids.add(enq.user_id as string);
  const { data: claims, error } = await admin.from("enquiry_portal_claims").select("id, status, delivery_channel, created_at, expires_at, attempts, risk_level, created_by").eq("enquiry_id", enquiryId).order("created_at", { ascending: false }).limit(10);
  const { data: events } = error ? { data: [] } : await admin.from("enquiry_ownership_events").select("event, created_at, actor, reason").eq("enquiry_id", enquiryId).order("created_at", { ascending: false }).limit(10);
  (claims ?? []).forEach((c) => ids.add(c.created_by as string)); (events ?? []).forEach((e) => ids.add(e.actor as string));
  const labels = new Map<string, string>();
  if (ids.size) { const { data: profs } = await admin.from("profiles").select("id, full_name, member_number").in("id", [...ids]); for (const p of profs ?? []) labels.set(p.id as string, ((p.member_number as string | null) ?? (p.full_name as string | null) ?? "Unnamed profile")); }
  const viewer = await getCurrentUser(); const viewerIsAdmin = viewer ? hasRole(viewer, "admin") || isSuperAdmin(viewer) : false;
  return {
    tableMissing: Boolean(error),
    sourceChannel: (enq?.source_channel as string | null | undefined) ?? null,
    owner: enq?.user_id ? { label: labels.get(enq.user_id as string) ?? "A client account" } : null,
    invitations: (claims ?? []).map((c) => ({ id: c.id as string, status: c.status as string, channel: c.delivery_channel as string, createdAt: c.created_at as string, expiresAt: c.expires_at as string, attempts: Number(c.attempts), riskLevel: c.risk_level as string, createdByLabel: labels.get(c.created_by as string) ?? null, canRevoke: c.status === "open" && (viewerIsAdmin || c.created_by === viewerId) })),
    events: (events ?? []).map((e) => ({ event: e.event as string, at: e.created_at as string, actorLabel: labels.get(e.actor as string) ?? null, reason: (e.reason as string | null) ?? null })),
  };
}
