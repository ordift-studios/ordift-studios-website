// BOOKING CONFIRMATION - reading the admin form (pure, no I/O). Everything typed here is DATA to be validated by rules.ts and re-checked by the database; nothing in this module authorises anything.
import type { Resolution, Segment } from "./rules";

type FormLike = { get(name: string): FormDataEntryValue | null; getAll(name: string): FormDataEntryValue[] };
const str = (f: FormLike, k: string) => String(f.get(k) ?? "").trim();

// "2026-12-01T09:00" typed as wall-clock time in an IANA zone -> the exact instant (ISO, UTC). Returns null when the text or zone is not valid. Handles daylight-saving changes by re-evaluating the offset at the result.
function offsetMs(utcMs: number, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(utcMs / 1000) * 1000;
}
export function zonedToIso(local: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { return null; }
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  if (Number.isNaN(wall) || new Date(wall).getUTCMonth() !== Number(m[2]) - 1) return null;          // 31 February and the like
  let guess = wall - offsetMs(wall, tz);
  guess = wall - offsetMs(guess, tz);
  return new Date(guess).toISOString();
}

// the reverse, for pre-filling a change: an instant -> "YYYY-MM-DDTHH:mm" wall-clock time in the session's own zone
export function isoToZonedLocal(iso: string, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export const MAX_SEGMENTS = 20, MAX_RESOLUTIONS = 40;
export type BookingForm = {
  enquiryId: string; quotationId: string; expectedVersion: number; assignedProfileId: string | null; segments: Segment[]; segmentError: string | null; escalators: string[];
  clarification: { kind: string; evidence: string } | null; resolutions: (Resolution & { confirmedWithPerson: boolean })[]; basis: string | null; confirmSentence: string;
};
export function parseBookingForm(f: FormLike): BookingForm {
  const n = Math.min(Math.max(Number(f.get("segCount") ?? 0) || 0, 0), MAX_SEGMENTS);
  const segments: Segment[] = []; let segmentError: string | null = null;
  for (let i = 0; i < n; i++) {
    const tz = str(f, `seg${i}_tz`), kindRaw = str(f, `seg${i}_kind`);
    const kind = (["on_site", "online", "studio"].includes(kindRaw) ? kindRaw : "on_site") as Segment["kind"];
    const startsAt = zonedToIso(str(f, `seg${i}_start`), tz), endsAt = zonedToIso(str(f, `seg${i}_end`), tz);
    if (!startsAt || !endsAt) { segmentError ??= `Session ${i + 1}: enter a valid start, end and time zone.`; continue; }
    segments.push({ startsAt, endsAt, timezone: tz, kind, location: str(f, `seg${i}_location`) || null, platform: str(f, `seg${i}_platform`) || null, note: str(f, `seg${i}_note`) || null });
  }
  const r = Math.min(Math.max(Number(f.get("resCount") ?? 0) || 0, 0), MAX_RESOLUTIONS);
  const resolutions: BookingForm["resolutions"] = [];
  for (let i = 0; i < r; i++) {
    const key = str(f, `res${i}_key`); if (!key) continue;
    resolutions.push({ key, kind: "availability_verified", method: str(f, `res${i}_method`), reference: str(f, `res${i}_reference`), verifiedOn: str(f, `res${i}_on`), confirmedWithPerson: f.get(`res${i}_confirm`) === "on" });   // verifiedWithProfileId is filled by the server from the chosen person, never typed
  }
  const kind = str(f, "clarKind"), evidence = str(f, "clarEvidence");
  return {
    enquiryId: str(f, "enquiryId"), quotationId: str(f, "quotationId"), expectedVersion: Number(f.get("expectedVersion") ?? 0) || 0,
    assignedProfileId: str(f, "assignedProfileId") || null, segments, segmentError, escalators: [...new Set(f.getAll("escalator").map(String))],
    clarification: kind || evidence ? { kind, evidence } : null, resolutions, basis: str(f, "basis") || null, confirmSentence: str(f, "confirmSentence"),
  };
}
// The person must type this exact sentence to confirm, change or cancel (a deliberate act, not a stray click).
export const confirmSentenceFor = (reference: string, verb: "confirm" | "change" | "cancel") => `${verb} booking ${reference}`;
export const sentenceMatches = (typed: string, reference: string, verb: "confirm" | "change" | "cancel") => typed.trim().toLowerCase() === confirmSentenceFor(reference, verb).toLowerCase();

// ---- the versioned-settings form: "QAR=3000" lines, and word lists. Validation of the VALUES stays in recordBookingSettingsVersion (and the database).
export function parseSettingsForm(f: FormLike): { thresholds: Record<string, number>; alwaysCategories: string[]; escalators: string[]; status: "provisional" | "approved"; note: string; error: string | null } {
  const thresholds: Record<string, number> = {}; let error: string | null = null;
  for (const line of String(f.get("thresholds") ?? "").split(/\r?\n|,/).map((l) => l.trim()).filter(Boolean)) {
    const m = /^([A-Za-z]{3})\s*[=:]\s*([0-9]+(?:\.[0-9]+)?)$/.exec(line);
    if (!m) { error ??= `Could not read “${line}”. Write one currency per line, like QAR=3000.`; continue; }
    if (m[1].toUpperCase() in thresholds) error ??= `${m[1].toUpperCase()} appears twice.`;
    thresholds[m[1].toUpperCase()] = Number(m[2]);
  }
  const words = (k: string) => [...new Set(String(f.get(k) ?? "").split(/\r?\n|,/).map((w) => w.trim().toLowerCase().replace(/[\s-]+/g, "_")).filter(Boolean))];
  return { thresholds, alwaysCategories: words("alwaysCategories"), escalators: words("escalators"), status: f.get("status") === "approved" ? "approved" : "provisional", note: str(f, "note"), error };
}

// "Tell the client?" choice shared by change and cancel. DEFAULT = tell the client. Holding the notice back needs a written reason (at least a sentence); anything else (a missing or unknown choice) means TELL.
export type NoticeChoice = { ok: true; deferReason: string | null } | { ok: false; error: string };
export function parseNoticeChoice(f: FormLike): NoticeChoice {
  if (str(f, "notifyClient") !== "defer") return { ok: true, deferReason: null };
  const reason = str(f, "deferReason");
  if (reason.length < 10) return { ok: false, error: "To hold back the client notice, give a reason of at least a sentence. Otherwise leave it on 'Tell the client now'." };
  return { ok: true, deferReason: reason.slice(0, 300) };
}
export type CancelOutcomeChoice = "rescheduling_pending" | "final";
export const parseCancelOutcome = (f: FormLike): CancelOutcomeChoice | null => { const v = str(f, "outcome"); return v === "final" || v === "rescheduling_pending" ? v : null; };
