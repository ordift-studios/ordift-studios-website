// Controlled release of an assignment's files to the client. Pure.
//
// A file uploaded in the assignment workspace is PRIVATE. It becomes client-visible only after the
// professional submits it for release and management approves and releases it. Nothing is ever exposed
// automatically.
export const RELEASE_STATUSES = ["private", "submitted", "changes_requested", "approved", "released", "withdrawn"] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export const RELEASE_CATEGORIES = [
  { value: "sneak_peek", label: "Sneak peek / preview photographs", deliverableKey: "sneak-peeks" },
  { value: "thank_you_image", label: "Thank-you images", deliverableKey: "thank-you-images" },
  { value: "edited_selection", label: "Edited selections", deliverableKey: "edited-selections" },
  { value: "final_gallery", label: "Final photography gallery", deliverableKey: "final-gallery" },
  { value: "video_preview", label: "Video preview", deliverableKey: "video-previews" },
  { value: "final_video", label: "Final video", deliverableKey: "final-videos" },
  { value: "design_draft", label: "Graphic design draft", deliverableKey: "design-drafts" },
  { value: "final_design", label: "Final design", deliverableKey: "final-designs" },
  { value: "other", label: "Other file", deliverableKey: "other-deliverables" },
] as const;
export type ReleaseCategory = (typeof RELEASE_CATEGORIES)[number]["value"];

export function isReleaseCategory(v: string): v is ReleaseCategory {
  return RELEASE_CATEGORIES.some((c) => c.value === v);
}
export function releaseCategoryLabel(v: string | null): string {
  return RELEASE_CATEGORIES.find((c) => c.value === v)?.label ?? "Not categorised";
}
export function deliverableKeyFor(category: string): string | null {
  return RELEASE_CATEGORIES.find((c) => c.value === category)?.deliverableKey ?? null;
}

// What the professional sees (internal wording; the client only ever sees released files).
export const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  private: "Private — not submitted",
  submitted: "Submitted for review",
  changes_requested: "Changes requested",
  approved: "Approved — awaiting release",
  released: "Released to the client",
  withdrawn: "Withdrawn",
};

export type ReleaseAction = "submit" | "withdraw_from_review" | "approve" | "request_changes" | "release" | "reject";
export type ReleaseActor = "professional" | "management";

const TRANSITIONS: Record<ReleaseAction, { from: ReleaseStatus[]; to: ReleaseStatus; actor: ReleaseActor }> = {
  submit: { from: ["private", "changes_requested"], to: "submitted", actor: "professional" },
  withdraw_from_review: { from: ["submitted", "changes_requested", "approved"], to: "private", actor: "professional" },
  approve: { from: ["submitted"], to: "approved", actor: "management" },
  request_changes: { from: ["submitted", "approved"], to: "changes_requested", actor: "management" },
  release: { from: ["approved"], to: "released", actor: "management" },
  reject: { from: ["submitted", "approved", "changes_requested"], to: "withdrawn", actor: "management" },
};

export function transition(from: string, action: ReleaseAction, actor: ReleaseActor): { ok: true; to: ReleaseStatus } | { ok: false; error: string } {
  const t = TRANSITIONS[action];
  if (!t) return { ok: false, error: "Unknown action." };
  if (t.actor !== actor) return { ok: false, error: actor === "professional" ? "Only management can do that." : "Only the assigned professional can do that." };
  if (!(t.from as string[]).includes(from)) return { ok: false, error: `That can't be done while the file is “${RELEASE_STATUS_LABELS[from as ReleaseStatus] ?? from}”.` };
  return { ok: true, to: t.to };
}

// What a professional may do next with a file, for the UI.
export function professionalActions(status: string): ReleaseAction[] {
  return (["submit", "withdraw_from_review"] as ReleaseAction[]).filter((a) => transition(status, a, "professional").ok);
}
export function managementActions(status: string): ReleaseAction[] {
  return (["approve", "request_changes", "release", "reject"] as ReleaseAction[]).filter((a) => transition(status, a, "management").ok);
}

// A professional may remove a file they uploaded only while it is still their own private working copy: before it has
// been submitted, or after management sent it back. Once submitted, approved or released it is part of the review
// record and can only be withdrawn from review, never deleted.
export function canRemoveOwnFile(status: string): boolean {
  return status === "private" || status === "changes_requested";
}

export function validateSubmitForRelease(input: { category: string; title: string; description: string }): { ok: true } | { ok: false; error: string } {
  if (!isReleaseCategory(input.category)) return { ok: false, error: "Choose what kind of file this is." };
  if (input.title.trim().length < 3) return { ok: false, error: "Give the file a title the client will recognise." };
  if (input.title.length > 160 || input.description.length > 1000) return { ok: false, error: "The title or description is too long." };
  return { ok: true };
}

// Client-visible portal path for a released file: authorised and audited, never a raw storage link.
export function clientFilePath(fileId: string): string {
  return `/portal/client/files/${fileId}/download`;
}

// Separation of duties: nobody reviews or releases work they did themselves. A reviewer is conflicted if they
// uploaded the file, submitted it for release, or are the professional assigned to the job it belongs to —
// whatever their administrative role (a Super Admin who is the assigned photographer is the professional).
// The same rule is enforced again by a database constraint on who uploaded/submitted a file.
export const SELF_REVIEW_MESSAGE =
  "You can't review or release your own work. You uploaded or submitted this file, or you are the professional assigned to this job, so an independent reviewer must approve and release it.";

export function reviewerConflict(input: { reviewerId: string; uploadedBy: string | null; submittedBy: string | null; assigneeId: string | null }): string | null {
  const { reviewerId } = input;
  if (reviewerId && (reviewerId === input.uploadedBy || reviewerId === input.submittedBy || reviewerId === input.assigneeId)) return SELF_REVIEW_MESSAGE;
  return null;
}

// Shown to an administrator who is also the professional assigned to the job, whether or not anything has been
// submitted yet, so the rule is visible before it is needed.
export const ASSIGNEE_NOTICE_TITLE = "You are the assigned professional on this job";
export const ASSIGNEE_NOTICE_BODY =
  "You can upload your work, submit your job report and submit files for review, but you cannot review, approve or release your own files, whatever your administrative role. A different person must do that.";

export function isAssignedProfessional(viewerId: string, assigneeId: string | null): boolean {
  return Boolean(viewerId) && viewerId === assigneeId;
}
