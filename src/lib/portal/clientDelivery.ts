import { createHash } from "node:crypto";

// Client-side confirmation of a delivery (receipt / acceptance / corrections) and the optional experience rating.
// Pure rules only: nothing here touches the database. Records are kept as audited activity-log events, so each action keeps its
// own history and none of them changes a request, engagement, payable, file or retention state.

export const DELIVERY_ACTIONS = {
  receipt: "client_delivery.receipt_confirmed",
  accept: "client_delivery.accepted",
  corrections: "client_delivery.corrections_requested",
} as const;
export type DeliveryKind = keyof typeof DELIVERY_ACTIONS;
export const RATING_ACTION = "client_feedback.rating_submitted";

export const DELIVERY_LABELS: Record<DeliveryKind, string> = {
  receipt: "received their photographs",
  accept: "reviewed and accepted the delivery",
  corrections: "asked for corrections",
};

export const REMARKS_MAX = 1000;
export const COMMENT_MAX = 1500;

// A fingerprint of exactly which released files the client was looking at. If more files are released later the fingerprint
// changes, so an old confirmation is never presented as covering new files.
export function batchHash(fileIds: string[]): string {
  return createHash("sha256").update([...new Set(fileIds)].sort().join("|")).digest("hex").slice(0, 16);
}

export function parseDeliveryKind(value: unknown): DeliveryKind | null {
  return value === "receipt" || value === "accept" || value === "corrections" ? value : null;
}

export function cleanText(value: unknown, max: number): string {
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

export const RATING_CATEGORIES = [
  { key: "quality", label: "Quality of photography and final delivery" },
  { key: "professionalism", label: "Professionalism and attitude" },
  { key: "communication", label: "Communication and responsiveness" },
  { key: "punctuality", label: "Punctuality and reliability" },
  { key: "overall", label: "Overall service experience" },
] as const;
export type RatingKey = (typeof RATING_CATEGORIES)[number]["key"];
export type Ratings = Partial<Record<RatingKey, number>>;

// 1-10 whole numbers only. Every category is optional; at least one must be given (an overall rating alone is enough).
export function parseRatings(get: (key: string) => unknown): { ok: true; ratings: Ratings } | { ok: false; error: string } {
  const ratings: Ratings = {};
  for (const { key } of RATING_CATEGORIES) {
    const raw = String(get(key) ?? "").trim();
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 10) return { ok: false, error: "Choose a number from 1 to 10." };
    ratings[key] = n;
  }
  if (Object.keys(ratings).length === 0) return { ok: false, error: "Choose at least one rating, or skip." };
  return { ok: true, ratings };
}

export type DeliveryEvent = { action: string; at: string; batch: string | null; remarks: string | null };
export type DeliveryState = {
  currentBatch: string;
  receipt: { at: string } | null;
  accepted: { at: string } | null;
  corrections: { at: string; remarks: string | null } | null;
  // true when the client confirmed something about an EARLIER set of files and more have been released since
  staleSince: string | null;
};

// The latest event of each kind that covers the CURRENT set of released files.
export function deriveDeliveryState(events: DeliveryEvent[], currentBatch: string): DeliveryState {
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const latest = (action: string) => [...ordered].reverse().find((e) => e.action === action);
  const forCurrent = (action: string) => [...ordered].reverse().find((e) => e.action === action && e.batch === currentBatch);
  const receipt = forCurrent(DELIVERY_ACTIONS.receipt);
  const accepted = forCurrent(DELIVERY_ACTIONS.accept);
  const corrections = forCurrent(DELIVERY_ACTIONS.corrections);
  const anyOld = [DELIVERY_ACTIONS.receipt, DELIVERY_ACTIONS.accept, DELIVERY_ACTIONS.corrections]
    .map(latest)
    .find((e) => e && e.batch !== currentBatch);
  return {
    currentBatch,
    receipt: receipt ? { at: receipt.at } : null,
    accepted: accepted ? { at: accepted.at } : null,
    corrections: corrections ? { at: corrections.at, remarks: corrections.remarks } : null,
    staleSince: anyOld && !receipt && !accepted ? anyOld.at : null,
  };
}

export function archiveFileName(reference: string): string {
  const ref = reference.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "project";
  return `Ordift-${ref}-photographs.zip`;
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.max(1, Math.round(n / 1024 ** 2))} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}
