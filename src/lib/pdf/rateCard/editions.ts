// SERVER-SIDE edition control for the rate card: Draft → (Preview) → Founder Approval → Approved Edition → Download. Super Admin only. Nothing here publishes or distributes anything.
// An approved edition is frozen in the database (see supabase/proposals/PROPOSED_0176_pdf_document_editions.sql); this module is the only writer and applies every rule again on the server.
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId } from "@/lib/organization/authority";
import { canonicalJson, contentHash } from "./edition";
import { applyEligibility, excludedByEligibility, type LicensedActivities } from "./eligibility";
import { CURRENCY_POLICY } from "./policy";
import { usdDrift } from "./convert";
import type { RateCardContent } from "./types";
import { unknownKeys, validateRateCard } from "./validate";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
const NOT_ALLOWED = { ok: false as const, error: "Only Super Admin may manage rate card editions." };
const KIND = "rate_card";

export type EditionSummary = { id: string; marketSlug: string; editionLabel: string; status: "draft" | "approved" | "superseded"; currency: string | null; effectiveDate: string | null; createdAt: string; updatedAt: string; approvedAt: string | null; contentSha256: string | null };
export type EditionRecord = EditionSummary & { content: RateCardContent; approvedBy: string | null; clearanceStatement: string | null; supersededBy: string | null };

const SUMMARY = "id, market_slug, edition_label, status, currency, effective_date, created_at, updated_at, approved_at, content_sha256";
const summary = (r: Record<string, unknown>): EditionSummary => ({ id: r.id as string, marketSlug: r.market_slug as string, editionLabel: r.edition_label as string, status: r.status as EditionSummary["status"], currency: (r.currency as string) ?? null, effectiveDate: (r.effective_date as string) ?? null, createdAt: r.created_at as string, updatedAt: r.updated_at as string, approvedAt: (r.approved_at as string) ?? null, contentSha256: (r.content_sha256 as string) ?? null });
const record = (r: Record<string, unknown>): EditionRecord => ({ ...summary(r), content: r.content as RateCardContent, approvedBy: (r.approved_by as string) ?? null, clearanceStatement: (r.clearance_statement as string) ?? null, supersededBy: (r.superseded_by as string) ?? null });

export async function listEditions(actorUserId: string): Promise<EditionSummary[]> {
  if (!(await isSuperAdminId(actorUserId))) return [];
  const { data } = await createAdminClient().from("pdf_document_editions").select(SUMMARY).eq("kind", KIND).order("created_at", { ascending: false });
  return (data ?? []).map(summary);
}

export async function getEdition(actorUserId: string, id: string): Promise<Result<{ edition: EditionRecord; integrity: "ok" | "not_applicable" | "FAILED" }>> {
  if (!(await isSuperAdminId(actorUserId))) return NOT_ALLOWED;
  const { data } = await createAdminClient().from("pdf_document_editions").select("*").eq("id", id).eq("kind", KIND).maybeSingle();
  if (!data) return { ok: false, error: "That edition was not found." };
  const edition = record(data);
  const integrity = edition.status === "draft" ? "not_applicable" : edition.contentSha256 && (await contentHash(edition.content)) === edition.contentSha256 ? "ok" : "FAILED";
  return { ok: true, edition, integrity };
}

const sizeOk = (c: RateCardContent) => canonicalJson(c).length < 900_000;
function draftProblems(c: RateCardContent): string | null {
  if (!sizeOk(c)) return "The rate card is too large to save.";
  const unknown = unknownKeys(c); if (unknown.length) return `The content contains fields that a rate card may not carry: ${unknown.slice(0, 3).join(", ")}.`;
  const v = validateRateCard(c, "draft"); return v.errors.length ? v.errors[0] : null;
}
const dupMessage = (m: string) => (/pdf_editions_label_unique|duplicate key/i.test(m) ? "An edition with that label already exists for this market. Use a new label." : m);

export async function createDraft(p: { actorUserId: string; content: RateCardContent }): Promise<Result<{ id: string }>> {
  if (!(await isSuperAdminId(p.actorUserId))) return NOT_ALLOWED;
  const problem = draftProblems(p.content); if (problem) return { ok: false, error: problem };
  const { data, error } = await createAdminClient().from("pdf_document_editions").insert({
    kind: KIND, market_slug: p.content.meta.marketSlug, edition_label: p.content.meta.editionLabel.trim(), status: "draft", content: p.content, currency: p.content.meta.currency, effective_date: p.content.meta.effectiveDate, created_by: p.actorUserId,
  }).select("id").single();
  if (error || !data) return { ok: false, error: dupMessage(error?.message ?? "The draft could not be saved.") };
  await logActivity({ actorUserId: p.actorUserId, action: "pdf_edition.draft_created", entityType: "pdf_document_edition", entityId: data.id as string, metadata: { kind: KIND, market: p.content.meta.marketSlug, editionLabel: p.content.meta.editionLabel } });
  return { ok: true, id: data.id as string };
}

export async function updateDraft(p: { actorUserId: string; id: string; content: RateCardContent; expectedUpdatedAt: string }): Promise<Result<{ updatedAt: string }>> {
  if (!(await isSuperAdminId(p.actorUserId))) return NOT_ALLOWED;
  const db = createAdminClient();
  const { data: cur } = await db.from("pdf_document_editions").select("id, status, market_slug, updated_at").eq("id", p.id).eq("kind", KIND).maybeSingle();
  if (!cur) return { ok: false, error: "That edition was not found." };
  if (cur.status !== "draft") return { ok: false, error: "An approved edition cannot be edited. Start a new edition instead." };
  if (cur.market_slug !== p.content.meta.marketSlug) return { ok: false, error: "The market of an edition cannot be changed. Start a new draft for the other market." };
  const problem = draftProblems(p.content); if (problem) return { ok: false, error: problem };
  const { data, error } = await db.from("pdf_document_editions").update({ content: p.content, edition_label: p.content.meta.editionLabel.trim(), currency: p.content.meta.currency, effective_date: p.content.meta.effectiveDate })
    .eq("id", p.id).eq("status", "draft").eq("updated_at", p.expectedUpdatedAt).select("updated_at");
  if (error) return { ok: false, error: dupMessage(error.message) };
  if (!(data ?? []).length) return { ok: false, error: "The draft was changed elsewhere since you opened it. Reload it before saving." };
  await logActivity({ actorUserId: p.actorUserId, action: "pdf_edition.draft_updated", entityType: "pdf_document_edition", entityId: p.id, metadata: { kind: KIND, editionLabel: p.content.meta.editionLabel } });
  return { ok: true, updatedAt: (data as { updated_at: string }[])[0].updated_at };
}

export type ApprovalDeps = {
  currentUsd?: () => Promise<RateCardContent | null>;           // a fresh USD card from the CURRENT selling rates, for the drift guard
  licensed?: () => Promise<LicensedActivities | null>;           // the issuing entity's CURRENT licensed activities
};

export async function approveEdition(p: { actorUserId: string; id: string; clearanceStatement: string; today: string; deps?: ApprovalDeps }): Promise<Result<{ contentSha256: string; supersededEditionId: string | null }>> {
  if (!(await isSuperAdminId(p.actorUserId))) return NOT_ALLOWED;
  const db = createAdminClient();
  const { data } = await db.from("pdf_document_editions").select("*").eq("id", p.id).eq("kind", KIND).maybeSingle();
  if (!data) return { ok: false, error: "That edition was not found." };
  const e = record(data);
  if (e.status !== "draft") return { ok: false, error: "Only a draft can be approved." };
  if (p.clearanceStatement.trim().length < 10) return { ok: false, error: "Write the clearance statement (what was checked and cleared) before approving." };

  let content = e.content;
  if (p.deps?.licensed) {                                                                    // eligibility is checked again now, against the entity's CURRENT licensed activities
    const lic = await p.deps.licensed();
    if (!lic) return { ok: false, error: "The issuing entity's licensed activities could not be verified, so the card cannot be approved." };
    const fresh = applyEligibility(content, lic);
    const was = new Set(excludedByEligibility(content)); const now = excludedByEligibility(fresh).filter((x) => !was.has(x));
    const newlyBlocked = fresh.sections.some((s) => s.items.some((i) => i.included !== false && i.eligibility && !i.eligibility.ok));
    if (newlyBlocked || now.length) return { ok: false, error: `Eligibility changed since the draft was prepared: ${now[0] ?? "an included item is no longer eligible"}. Rebuild the draft.` };
  }
  const v = validateRateCard(content, "approval", { today: p.today, currencyPolicyApproved: CURRENCY_POLICY.clientPublicationOfConvertedPricesApproved });
  if (v.errors.length) return { ok: false, error: `The card cannot be approved yet: ${v.errors[0]}${v.errors.length > 1 ? ` (and ${v.errors.length - 1} more)` : ""}` };
  if (p.deps?.currentUsd) {                                                                  // the card must still match what quotations will calculate
    const cur = await p.deps.currentUsd();
    if (!cur) return { ok: false, error: "The current selling rates could not be read, so the card cannot be checked against them." };
    const drift = usdDrift(content, cur);
    if (drift.length) return { ok: false, error: `The selling rates changed since this draft was prepared: ${drift[0]}${drift.length > 1 ? ` (and ${drift.length - 1} more)` : ""}. Rebuild the draft.` };
  }
  content = JSON.parse(canonicalJson(content)) as RateCardContent;                         // the hash is of exactly this detached copy
  const sha = await contentHash(content);
  const { data: rpc, error } = await db.rpc("approve_pdf_edition", { p_id: p.id, p_actor: p.actorUserId, p_sha256: sha, p_clearance: p.clearanceStatement.trim(), p_expected_updated_at: e.updatedAt, p_audit: { clearanceChars: p.clearanceStatement.trim().length } });
  if (error) {
    const m = error.message;
    return { ok: false, error: /not_authorised/.test(m) ? NOT_ALLOWED.error : /edition_changed|40001/.test(m) ? "The draft changed after it was checked. Review it again before approving." : /not_a_draft/.test(m) ? "Only a draft can be approved." : /one_approved|duplicate/.test(m) ? "Another edition was approved at the same time. Reload and try again." : `The edition could not be approved: ${m}` };
  }
  const row = Array.isArray(rpc) ? (rpc[0] as { superseded_id?: string | null }) : (rpc as { superseded_id?: string | null } | null);
  return { ok: true, contentSha256: sha, supersededEditionId: row?.superseded_id ?? null };
}

// Copies an approved (or superseded) edition into a NEW draft with a new label; the original is untouched. This is the only way to change an approved card.
export async function startNextEdition(p: { actorUserId: string; fromId: string; editionLabel: string; effectiveDate: string }): Promise<Result<{ id: string }>> {
  if (!(await isSuperAdminId(p.actorUserId))) return NOT_ALLOWED;
  const got = await getEdition(p.actorUserId, p.fromId); if (!got.ok) return got;
  if (got.edition.status === "draft") return { ok: false, error: "A draft is edited directly; a new edition is only needed after approval." };
  if (got.integrity !== "ok") return { ok: false, error: "The source edition failed its integrity check, so it cannot be copied." };
  if (!p.editionLabel.trim() || p.editionLabel.trim().toLowerCase() === got.edition.editionLabel.trim().toLowerCase()) return { ok: false, error: "Give the new edition a different label." };
  const content: RateCardContent = { ...got.edition.content, meta: { ...got.edition.content.meta, editionLabel: p.editionLabel.trim(), effectiveDate: p.effectiveDate } };
  return createDraft({ actorUserId: p.actorUserId, content });
}

// The only route to an UNWATERMARKED PDF: an approved edition whose stored content still matches its hash. Every download is audited.
export async function getApprovedEditionForDownload(p: { actorUserId: string; id: string }): Promise<Result<{ edition: EditionRecord }>> {
  const got = await getEdition(p.actorUserId, p.id); if (!got.ok) return got;
  if (got.edition.status !== "approved") return { ok: false, error: got.edition.status === "draft" ? "A draft cannot be downloaded as a final PDF. Approve it first, or preview it as a draft." : "This edition was superseded by a newer approved edition." };
  if (got.integrity !== "ok") return { ok: false, error: "This edition failed its integrity check (its stored content does not match the approved hash). It will not be released." };
  await logActivity({ actorUserId: p.actorUserId, action: "pdf_edition.downloaded", entityType: "pdf_document_edition", entityId: p.id, metadata: { kind: KIND, editionLabel: got.edition.editionLabel, contentSha256: got.edition.contentSha256 } });
  return { ok: true, edition: got.edition };
}
