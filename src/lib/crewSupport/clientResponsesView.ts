import { DELIVERY_ACTIONS, RATING_ACTION, RATING_CATEGORIES, type Ratings } from "@/lib/portal/clientDelivery";

// Pure view-model for "Client Acceptance & Feedback" and the read-only closure summary. It only READS the audited client
// response records (activity_log) and the current state of the request / engagement / files / payable - it never changes any
// of them and keeps no second copy of the data.

export const NOTIFICATION_ACTION = "client_delivery.admin_notification";
export const BULK_DOWNLOAD_ACTION = "project_file.client_bulk_downloaded";

export type RawEvent = { at: string; action: string; metadata: Record<string, unknown> | null };

export type HistoryItem = {
  at: string;
  kind: "receipt" | "accepted" | "corrections" | "rating" | "downloaded";
  title: string;
  detail: string | null;
  batch: string | null;
  coversCurrentFiles: boolean;
  // what happened to the internal email about this submission
  notification: string;
};

export type RatingView = { at: string; ratings: Ratings; comment: string | null; professionalProfileId: string | null; batch: string | null; coversCurrentFiles: boolean };

export type ClientResponsesView = {
  currentBatch: string | null;
  receipt: { at: string; coversCurrentFiles: boolean } | null;
  accepted: { at: string; coversCurrentFiles: boolean } | null;
  corrections: { at: string; remarks: string | null; coversCurrentFiles: boolean }[];
  rating: RatingView | null;
  history: HistoryItem[];
  hasAnyResponse: boolean;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

export function buildClientResponsesView(events: RawEvent[], currentBatch: string | null): ClientResponsesView {
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const notifications = ordered.filter((e) => e.action === NOTIFICATION_ACTION);
  const covers = (batch: string | null) => Boolean(currentBatch) && batch === currentBatch;

  // "sent" only means the email provider accepted it; a delivery failure later is outside what the platform can see.
  const notificationFor = (kind: string, at: string, batch: string | null): string => {
    const n = notifications.find((x) => x.metadata?.kind === kind && x.at >= at && (batch === null || x.metadata?.batch === batch));
    if (!n) return "No notification attempt recorded";
    const m = n.metadata ?? {};
    if (m.ok === true && m.mode === "logged") return "Not sent — email sending is off in this environment";
    if (m.ok === true) return "Email to Ordift administrator handed to the email provider";
    return `Email could not be sent${str(m.error) ? ` (${str(m.error)})` : ""}`;
  };

  const history: HistoryItem[] = [];
  let receipt: ClientResponsesView["receipt"] = null;
  let accepted: ClientResponsesView["accepted"] = null;
  const corrections: ClientResponsesView["corrections"] = [];
  let rating: RatingView | null = null;

  for (const e of ordered) {
    const m = e.metadata ?? {};
    const batch = str(m.batch);
    const files = typeof m.fileCount === "number" ? m.fileCount : null;
    if (e.action === DELIVERY_ACTIONS.receipt) {
      receipt = { at: e.at, coversCurrentFiles: covers(batch) };
      history.push({ at: e.at, kind: "receipt", title: "Client confirmed receipt of the photographs", detail: files !== null ? `${files} released files` : null, batch, coversCurrentFiles: covers(batch), notification: notificationFor("receipt", e.at, batch) });
    } else if (e.action === DELIVERY_ACTIONS.accept) {
      accepted = { at: e.at, coversCurrentFiles: covers(batch) };
      history.push({ at: e.at, kind: "accepted", title: "Client reviewed and accepted the delivery", detail: files !== null ? `${files} released files${str(m.remarks) ? ` — “${str(m.remarks)}”` : ""}` : str(m.remarks), batch, coversCurrentFiles: covers(batch), notification: notificationFor("accept", e.at, batch) });
    } else if (e.action === DELIVERY_ACTIONS.corrections) {
      corrections.push({ at: e.at, remarks: str(m.remarks), coversCurrentFiles: covers(batch) });
      history.push({ at: e.at, kind: "corrections", title: "Client asked for corrections", detail: str(m.remarks), batch, coversCurrentFiles: covers(batch), notification: notificationFor("corrections", e.at, batch) });
    } else if (e.action === RATING_ACTION) {
      const ratings = (m.ratings && typeof m.ratings === "object" ? m.ratings : {}) as Ratings;
      rating = { at: e.at, ratings, comment: str(m.comment), professionalProfileId: str(m.professionalProfileId), batch, coversCurrentFiles: covers(batch) };
      const given = RATING_CATEGORIES.filter((c) => ratings[c.key] !== undefined).map((c) => `${c.key} ${ratings[c.key]}/10`).join(", ");
      history.push({ at: e.at, kind: "rating", title: "Client submitted experience feedback", detail: given || null, batch, coversCurrentFiles: covers(batch), notification: notificationFor("rating", e.at, batch) });
    } else if (e.action === BULK_DOWNLOAD_ACTION) {
      history.push({ at: e.at, kind: "downloaded", title: "Client downloaded all photographs (ZIP)", detail: files !== null ? `${files} files` : null, batch: null, coversCurrentFiles: true, notification: "—" });
    }
  }
  return {
    currentBatch,
    receipt,
    accepted,
    corrections,
    rating,
    history,
    hasAnyResponse: Boolean(receipt || accepted || corrections.length || rating),
  };
}

export type ClosureFacts = {
  releasedCount: number;
  protectedCount: number; // released files that are retained or Final Approved
  finalApprovedCount: number;
  engagementStatus: string | null;
  requestStatus: string;
  payable: { status: string; amount: string; currency: string; paid: boolean } | null;
  pendingCorrectionRequests: number | null; // null = could not be read
};

export type ClosureRow = { label: string; value: string; tone: "good" | "attention" | "neutral" };

// Read-only. Nothing here closes, completes or changes anything.
export function buildClosureSummary(view: ClientResponsesView, f: ClosureFacts): { rows: ClosureRow[]; acceptedButNotCompleted: boolean } {
  const acceptedNow = Boolean(view.accepted?.coversCurrentFiles);
  const lastCorrection = view.corrections[view.corrections.length - 1] ?? null;
  const correctionAfterAcceptance = Boolean(lastCorrection && (!view.accepted || lastCorrection.at > view.accepted.at));
  let outstanding: ClosureRow;
  if (f.pendingCorrectionRequests === null) outstanding = { label: "Outstanding corrections", value: "Unknown", tone: "attention" };
  else if (f.pendingCorrectionRequests > 0 || correctionAfterAcceptance) outstanding = { label: "Outstanding corrections", value: f.pendingCorrectionRequests > 0 ? `Yes — ${f.pendingCorrectionRequests} pending client request${f.pendingCorrectionRequests === 1 ? "" : "s"}` : "Yes — the client asked for corrections", tone: "attention" };
  else outstanding = { label: "Outstanding corrections", value: "No", tone: "good" };

  const allProtected = f.releasedCount > 0 && f.protectedCount >= f.releasedCount;
  const engagementDone = f.engagementStatus === "completed";
  const requestDone = f.requestStatus === "completed";
  const payable = f.payable
    ? `${f.payable.status}${f.payable.paid ? ", paid" : ", unpaid"} — ${f.payable.currency} ${f.payable.amount}`
    : "No linked payable";

  const rows: ClosureRow[] = [
    { label: "Client accepted delivery", value: acceptedNow ? "Yes" : view.accepted ? "Yes, for an earlier set of files — new files were released since" : "No", tone: acceptedNow ? "good" : "attention" },
    outstanding,
    { label: "Released photographs", value: String(f.releasedCount), tone: "neutral" },
    { label: "Retention protection completed", value: allProtected ? "Yes" : `No — ${f.protectedCount} of ${f.releasedCount} retained or Final Approved`, tone: allProtected ? "good" : "attention" },
    { label: "Final Approved file requirement met", value: f.finalApprovedCount > 0 ? `Yes (${f.finalApprovedCount})` : "No — at least one file must be marked Final Approved", tone: f.finalApprovedCount > 0 ? "good" : "attention" },
    { label: "Engagement completed", value: engagementDone ? "Yes" : `No — ${(f.engagementStatus ?? "unknown").replace(/_/g, " ")}`, tone: engagementDone ? "good" : "attention" },
    { label: "Crew Support request completed", value: requestDone ? "Yes" : `No — ${f.requestStatus.replace(/_/g, " ")}`, tone: requestDone ? "good" : "attention" },
    { label: "Crew payable", value: payable, tone: "neutral" },
  ];
  return { rows, acceptedButNotCompleted: acceptedNow && !engagementDone };
}
