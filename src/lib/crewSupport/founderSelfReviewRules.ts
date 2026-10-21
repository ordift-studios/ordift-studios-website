// ORDIFT-POL-FSR-001 — Founder Self-Review & Client Deliverable Release Exception. Pure rules, no I/O, safe to import
// from client components. The database independently enforces the same rules (migration 0169); this module is what the
// application checks BEFORE it asks the database, and what the screens use to explain the process.
//
// The exception is not a role and not a bypass. It applies only to the verified Founder identity, on an engagement where
// that same person is the actual performer, for the exact files named in a declaration — one declaration per approval
// operation and a separate one per release operation. Normal separation of duties is unchanged for everyone else.

import { canReviewFile, isReviewableFileKind, type FileOutcome } from "./fileReview";
import type { ReleaseStatus } from "./fileRelease";

export const FSR_POLICY_CODE = "ORDIFT-POL-FSR-001";
export const FSR_POLICY_TITLE = "Founder Self-Review & Client Deliverable Release Exception";
export const FSR_MIN_JUSTIFICATION_CHARS = 30;
export const FSR_MIN_JUSTIFICATION_WORDS = 5;
export const FSR_EXCEPTION_TTL_HOURS = 168; // an exception lapses after 7 days; open a new one if needed
export const FSR_MAX_FILES_PER_DECLARATION = 200;

export const FSR_CONFLICT_ACKNOWLEDGEMENT =
  "I acknowledge that I am the performing professional on this engagement and also its reviewer, so this is a self-review under ORDIFT-POL-FSR-001. " +
  "No independent reviewer has been appointed. This exception does not make me independent of my own work, my second login is not an independent reviewer, " +
  "and everything I decide under it is permanently recorded.";
export const FSR_REVIEW_CONFIRMATION = "I have reviewed the selected images and decide on them as the performer under ORDIFT-POL-FSR-001.";
export const FSR_RELEASE_CONFIRMATION = "I confirm that exactly these images become visible to the client now. Releasing does not email the client, close the engagement or change any payment.";

export type SelfReviewDecision = "approve" | "request_changes" | "reject";

export function validateJustification(text: string): { ok: true } | { ok: false; error: string } {
  const t = text.trim();
  if (t.length < FSR_MIN_JUSTIFICATION_CHARS) return { ok: false, error: `Explain why a self-review is needed (at least ${FSR_MIN_JUSTIFICATION_CHARS} characters).` };
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < FSR_MIN_JUSTIFICATION_WORDS) return { ok: false, error: `Write at least ${FSR_MIN_JUSTIFICATION_WORDS} words — a short phrase is not a justification.` };
  if (new Set(words.map((w) => w.toLowerCase())).size < 4) return { ok: false, error: "The justification repeats the same words. Say what the situation actually is." };
  if (!/[a-z]{3,}/i.test(t)) return { ok: false, error: "The justification needs real words." };
  return { ok: true };
}

export function validateTypedCount(typed: unknown, expected: number): boolean {
  const n = typeof typed === "number" ? typed : Number(String(typed ?? "").trim());
  return Number.isInteger(n) && n === expected && expected > 0;
}

// ------------------------------------------------------------------ who can use it, and what the screen should say
export type FounderContext =
  | { state: "not_applicable" } // not the Founder, not the performer, or the exception is not installed
  | { state: "linked_login"; message: string } // a login under the Founder's common control: never independent
  | { state: "unavailable"; reason: string } // the Founder, but not currently authorized
  | { state: "available"; founderIdentityId: string; holderId: string }
  | { state: "open"; exception: OpenException; viewedFileIds: string[] };

export type OpenException = { id: string; openedAt: string; expiresAt: string; justification: string };

export const LINKED_LOGIN_MESSAGE =
  "This login is registered as being under the Founder's common control, so it is never an independent reviewer of the Founder's work and cannot use the self-review exception.";

export type ContextFacts = {
  viewerId: string;
  engagementPayeeId: string | null; // the performer: the engagement's assigned professional
  founderProfileId: string | null; // the active, verified Founder identity (if any)
  holderActive: boolean;
  viewerIsLinkedLogin: boolean; // the viewer is registered under the Founder's common control
  linkedFounderIsPerformer: boolean;
  open: (OpenException & { viewedFileIds: string[] }) | null;
};

export function resolveFounderContext(f: ContextFacts): FounderContext {
  if (f.viewerIsLinkedLogin) return f.linkedFounderIsPerformer ? { state: "linked_login", message: LINKED_LOGIN_MESSAGE } : { state: "not_applicable" };
  if (!f.founderProfileId || f.viewerId !== f.founderProfileId) return { state: "not_applicable" };
  if (f.engagementPayeeId !== f.viewerId) return { state: "not_applicable" };
  if (!f.holderActive) return { state: "unavailable", reason: "The self-review exception is not currently authorized for the Founder identity." };
  if (f.open) {
    const { viewedFileIds, ...exception } = f.open;
    return { state: "open", exception, viewedFileIds };
  }
  return { state: "available", founderIdentityId: "", holderId: "" };
}

// ------------------------------------------------------------------ per-file eligibility inside an open exception
export type ExceptionFile = { id: string; fileKind: string; releaseStatus: string; purged: boolean; engagementId: string; version: number; sizeBytes: number | null; storagePath: string };

export function decisionToStatus(d: SelfReviewDecision): ReleaseStatus {
  return d === "approve" ? "approved" : d === "request_changes" ? "changes_requested" : "withdrawn";
}

// The files a review declaration can name: deliverable-type, unpurged, in a reviewable status, and already opened in
// the viewer during this exception. Anything else is reported with the reason, never silently dropped into the set.
export function checkReviewSelection(params: {
  decisions: Record<string, SelfReviewDecision>;
  files: ExceptionFile[];
  engagementId: string;
  viewedFileIds: string[];
  note: string;
}): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const ids = Object.keys(params.decisions);
  if (ids.length === 0) errors.push("Select at least one image.");
  if (ids.length > FSR_MAX_FILES_PER_DECLARATION) errors.push(`Select at most ${FSR_MAX_FILES_PER_DECLARATION} images at a time.`);
  const byId = new Map(params.files.map((f) => [f.id, f]));
  const viewed = new Set(params.viewedFileIds);
  for (const id of ids) {
    const f = byId.get(id);
    const decision = params.decisions[id];
    if (!f) { errors.push(`${id}: not found.`); continue; }
    if (f.engagementId !== params.engagementId) { errors.push(`${id}: belongs to a different engagement.`); continue; }
    if (!isReviewableFileKind(f.fileKind) || f.purged) { errors.push(`${id}: not a deliverable image that can be reviewed.`); continue; }
    if (!canReviewFile({ fileKind: f.fileKind, releaseStatus: f.releaseStatus, purged: f.purged }, decision)) { errors.push(`${id}: its status does not allow this decision.`); continue; }
    if (!viewed.has(id)) errors.push(`${id}: open it in the review viewer first.`);
  }
  if (Object.values(params.decisions).some((d) => d !== "approve") && params.note.trim().length < 5) errors.push("Say what needs to change (or why it is declined) — the professional will see this.");
  return errors.length ? { ok: false, errors } : { ok: true };
}

export function checkReleaseSelection(params: { fileIds: string[]; files: ExceptionFile[]; engagementId: string }): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (params.fileIds.length === 0) errors.push("Select at least one approved image.");
  if (params.fileIds.length > FSR_MAX_FILES_PER_DECLARATION) errors.push(`Select at most ${FSR_MAX_FILES_PER_DECLARATION} images at a time.`);
  if (new Set(params.fileIds).size !== params.fileIds.length) errors.push("The selection contains a duplicate.");
  const byId = new Map(params.files.map((f) => [f.id, f]));
  for (const id of params.fileIds) {
    const f = byId.get(id);
    if (!f) errors.push(`${id}: not found.`);
    else if (f.engagementId !== params.engagementId) errors.push(`${id}: belongs to a different engagement.`);
    else if (f.purged || !isReviewableFileKind(f.fileKind)) errors.push(`${id}: not a deliverable image.`);
    else if (f.releaseStatus !== "approved") errors.push(`${id}: it is not approved, so it cannot be released.`);
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

// The selection snapshot stored with a declaration. Built from the server's own copy of each file — never from
// anything the browser sent. The database re-checks every element against the live row.
export function buildSelectionSnapshot(files: (ExceptionFile & { originalFilename: string; releaseCategory: string | null; clientTitle: string | null; mimeType: string | null })[], ids: string[]) {
  const byId = new Map(files.map((f) => [f.id, f]));
  return [...ids]
    .sort()
    .map((id) => {
      const f = byId.get(id);
      if (!f) throw new Error(`snapshot: file ${id} missing`);
      return { id: f.id, filename: f.originalFilename, version: f.version, size_bytes: f.sizeBytes, storage_path: f.storagePath, mime_type: f.mimeType, release_status: f.releaseStatus, release_category: f.releaseCategory, client_title: f.clientTitle };
    });
}

// ------------------------------------------------------------------ truthful reporting
export type DeclarationOutcome = { status: "completed" | "partial" | "failed" | "pending"; applied: number; failed: number; message: string };

export function declarationOutcome(kind: "review" | "release", outcomes: FileOutcome[]): DeclarationOutcome {
  const applied = outcomes.filter((o) => o.ok).length;
  const failed = outcomes.length - applied;
  const noun = kind === "review" ? "decision" : "release";
  if (outcomes.length === 0) return { status: "pending", applied: 0, failed: 0, message: `No ${noun} was applied.` };
  if (failed === 0) return { status: "completed", applied, failed, message: `${applied} of ${outcomes.length} ${noun}${outcomes.length === 1 ? "" : "s"} recorded under the Founder self-review exception.` };
  if (applied === 0) return { status: "failed", applied, failed, message: `None of the ${outcomes.length} ${noun}s could be applied — nothing changed. ${outcomes.find((o) => !o.ok)?.error ?? ""}`.trim() };
  return { status: "partial", applied, failed, message: `${applied} of ${outcomes.length} ${noun}s were applied and ${failed} failed (see the list). The declaration records exactly this.` };
}
