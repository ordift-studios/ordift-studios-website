// Job-completion report: the questionnaire per service category, and validation. Pure.
//
// A report is the professional's CONTEMPORANEOUS internal record of an assignment — useful for fair review
// and dispute resolution, never conclusive evidence against a client, and never shown to clients.

export const COMPLETION_STATUSES = ["completed", "partial", "not_performed"] as const;
export type CompletionStatus = (typeof COMPLETION_STATUSES)[number];
export const COMPLETION_STATUS_LABELS: Record<CompletionStatus, string> = {
  completed: "The assigned work was completed in full",
  partial: "The assigned work was completed in part",
  not_performed: "The assigned work was not performed",
};

export type ReportQuestion = { id: string; label: string; kind: "select" | "yes_no"; options?: { value: string; label: string }[] };

const YES_NO = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];

const ON_SITE_QUESTIONS: ReportQuestion[] = [
  { id: "onTime", label: "Did you arrive and start at the agreed time?", kind: "yes_no" },
  { id: "conditions", label: "Working conditions (light, space, weather, access)", kind: "select", options: [{ value: "good", label: "Good" }, { value: "workable", label: "Workable" }, { value: "difficult", label: "Difficult" }] },
  { id: "scheduleChanged", label: "Did the schedule change on the day?", kind: "yes_no" },
  { id: "clientCooperation", label: "Client / on-site cooperation", kind: "select", options: [{ value: "excellent", label: "Excellent" }, { value: "good", label: "Good" }, { value: "fair", label: "Fair" }, { value: "difficult", label: "Difficult" }] },
  { id: "equipmentIssues", label: "Any equipment problems?", kind: "yes_no" },
  { id: "editingRemaining", label: "Editing or post-production still to be done", kind: "select", options: [{ value: "none", label: "None" }, { value: "selects", label: "Selected images / highlights only" }, { value: "full", label: "Full edit / final gallery" }, { value: "video", label: "Video edit" }] },
];

const STUDIO_QUESTIONS: ReportQuestion[] = [
  { id: "briefClear", label: "Was the brief clear and complete?", kind: "yes_no" },
  { id: "materialsSupplied", label: "Were the supplied materials sufficient?", kind: "select", options: [{ value: "all", label: "Yes, all supplied" }, { value: "partial", label: "Partly" }, { value: "none", label: "No" }] },
  { id: "revisions", label: "Revisions requested so far", kind: "select", options: [{ value: "none", label: "None" }, { value: "minor", label: "Minor" }, { value: "major", label: "Major" }] },
  { id: "workCompleted", label: "How much of the work is complete?", kind: "select", options: [{ value: "all", label: "All of it" }, { value: "most", label: "Most of it" }, { value: "some", label: "Some of it" }] },
  { id: "approvalsOutstanding", label: "Are client approvals still outstanding?", kind: "yes_no" },
];

const GENERIC_QUESTIONS: ReportQuestion[] = [
  { id: "onTime", label: "Did the work start at the agreed time?", kind: "yes_no" },
  { id: "scheduleChanged", label: "Did the plan or schedule change?", kind: "yes_no" },
  { id: "clientCooperation", label: "Client cooperation", kind: "select", options: [{ value: "excellent", label: "Excellent" }, { value: "good", label: "Good" }, { value: "fair", label: "Fair" }, { value: "difficult", label: "Difficult" }] },
];

// Keys are the Crew Support service families (config.ts). Unknown or "other" gets the short generic set.
export function questionsFor(serviceFamily: string | null | undefined): ReportQuestion[] {
  switch (serviceFamily) {
    case "photography":
    case "videography":
    case "production":
      return ON_SITE_QUESTIONS;
    case "graphic-design":
    case "content-creation":
    case "branding":
      return STUDIO_QUESTIONS;
    default:
      return GENERIC_QUESTIONS;
  }
}

export type JobReportInput = {
  serviceFamily: string | null;
  actualServiceDate: string; // YYYY-MM-DD
  actualStartTime: string; // HH:MM or ""
  actualEndTime: string;
  completionStatus: string;
  wentSmoothly: boolean | null;
  answers: Record<string, string>;
  incidents: string;
  clientRequests: string;
  additionalServices: string;
  outstandingWork: string;
  remarks: string;
  correctionReason?: string; // required for a correction (version > 1)
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_TEXT = 2000;

export type ValidatedReport = Omit<JobReportInput, "answers" | "completionStatus" | "wentSmoothly"> & { completionStatus: CompletionStatus; wentSmoothly: boolean | null; answers: Record<string, string> };

// today = 'YYYY-MM-DD'. The service date may be in the past (a report for work already done); it may not
// be more than a day ahead (Qatar is UTC+3).
export function validateJobReport(input: JobReportInput, today: string, isCorrection: boolean): { ok: true; report: ValidatedReport } | { ok: false; error: string } {
  if (!DATE_RE.test(input.actualServiceDate) || Number.isNaN(Date.parse(`${input.actualServiceDate}T00:00:00Z`))) return { ok: false, error: "Enter the date the work was actually performed." };
  const latest = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  if (input.actualServiceDate > latest) return { ok: false, error: "The service date can't be in the future." };
  if (!(COMPLETION_STATUSES as readonly string[]).includes(input.completionStatus)) return { ok: false, error: "Say whether the work was completed, partly completed or not performed." };
  const status = input.completionStatus as CompletionStatus;
  for (const [label, t] of [["start", input.actualStartTime], ["end", input.actualEndTime]] as const) {
    if (t && !TIME_RE.test(t)) return { ok: false, error: `Enter the actual ${label} time as HH:MM (24-hour), or leave it blank.` };
  }
  for (const [label, v] of [["Incidents", input.incidents], ["Client requests", input.clientRequests], ["Additional services", input.additionalServices], ["Outstanding work", input.outstandingWork], ["Remarks", input.remarks]] as const) {
    if (v.length > MAX_TEXT) return { ok: false, error: `${label} is too long (maximum ${MAX_TEXT} characters).` };
  }
  const allowed = new Map(questionsFor(input.serviceFamily).map((q) => [q.id, q]));
  const answers: Record<string, string> = {};
  for (const [id, value] of Object.entries(input.answers)) {
    const q = allowed.get(id);
    if (!q) return { ok: false, error: "That report contains an unrecognised question." };
    if (value === "") continue;
    const valid = (q.kind === "yes_no" ? YES_NO : q.options ?? []).map((o) => o.value);
    if (!valid.includes(value)) return { ok: false, error: `Choose a valid answer for “${q.label}”.` };
    answers[id] = value;
  }
  if (status !== "completed" && input.remarks.trim().length < 5 && input.outstandingWork.trim().length < 5) {
    return { ok: false, error: "Explain what was not completed (in the outstanding-work or remarks box)." };
  }
  if (isCorrection && (input.correctionReason ?? "").trim().length < 5) return { ok: false, error: "Say what you are correcting and why — the original report is kept." };
  return { ok: true, report: { ...input, completionStatus: status, wentSmoothly: input.wentSmoothly, answers } };
}
