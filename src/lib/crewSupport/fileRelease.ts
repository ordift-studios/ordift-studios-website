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
