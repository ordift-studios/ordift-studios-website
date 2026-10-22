import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildClientResponsesView, buildClosureSummary, NOTIFICATION_ACTION, type ClosureFacts, type RawEvent } from "./clientResponsesView";

// Bright's ACTUAL recorded events for CSR-2026-000002 (Production, 2026-10-22; times are UTC).
const BATCH = "d0ee5c3581581256";
const bright: RawEvent[] = [
  { at: "2026-10-22T13:12:13Z", action: "project_file.client_bulk_downloaded", metadata: { fileCount: 21, totalBytes: 268684852 } },
  { at: "2026-10-22T13:34:56Z", action: "client_delivery.accepted", metadata: { batch: BATCH, fileCount: 21, remarks: null } },
  { at: "2026-10-22T13:36:15Z", action: "client_feedback.rating_submitted", metadata: { batch: BATCH, comment: "See me in my office", ratings: { overall: 8, quality: 8, punctuality: 8, communication: 8, professionalism: 8 }, professionalProfileId: "pro-1" } },
];
const facts = (o: Partial<ClosureFacts> = {}): ClosureFacts => ({
  releasedCount: 21, protectedCount: 0, finalApprovedCount: 0, engagementStatus: "engagement_active", requestStatus: "in_production",
  payable: { status: "approved", amount: "1000.00", currency: "QAR", paid: false }, pendingCorrectionRequests: 0, ...o,
});

describe("Bright's actual records are shown as recorded - nothing invented", () => {
  const view = buildClientResponsesView(bright, BATCH);
  it("acceptance and rating are present with their real timestamps, values and comment", () => {
    expect(view.accepted).toEqual({ at: "2026-10-22T13:34:56Z", coversCurrentFiles: true });
    expect(view.rating).toMatchObject({ at: "2026-10-22T13:36:15Z", ratings: { overall: 8, quality: 8, professionalism: 8, communication: 8, punctuality: 8 }, comment: "See me in my office", professionalProfileId: "pro-1", batch: BATCH });
  });
  it("no receipt record exists, and none is made up", () => {
    expect(view.receipt).toBeNull();
    expect(view.history.some((h) => h.kind === "receipt")).toBe(false);
  });
  it("shows the history oldest first, including the download, and says plainly that no internal email attempt was recorded", () => {
    expect(view.history.map((h) => h.kind)).toEqual(["downloaded", "accepted", "rating"]);
    expect(view.history[1].notification).toBe("No notification attempt recorded");
    expect(view.history[2].notification).toBe("No notification attempt recorded");
  });
});

describe("notification status comes from recorded outcomes", () => {
  const accept: RawEvent = { at: "2026-10-23T09:00:00Z", action: "client_delivery.accepted", metadata: { batch: BATCH, fileCount: 21 } };
  const n = (m: Record<string, unknown>): RawEvent => ({ at: "2026-10-23T09:00:02Z", action: NOTIFICATION_ACTION, metadata: { kind: "accept", batch: BATCH, ...m } });
  const status = (m: Record<string, unknown>) => buildClientResponsesView([accept, n(m)], BATCH).history[0].notification;
  it("handed to the provider / not sent (test mode) / failed - each is shown, and the response stays visible regardless", () => {
    expect(status({ ok: true, mode: "sent" })).toContain("handed to the email provider");
    expect(status({ ok: true, mode: "logged" })).toContain("Not sent");
    expect(status({ ok: false, error: "admin recipient not configured" })).toContain("could not be sent (admin recipient not configured)");
    expect(buildClientResponsesView([accept, n({ ok: false })], BATCH).accepted).not.toBeNull();
  });
});

describe("a later release of more files", () => {
  it("is not covered by an earlier acceptance", () => {
    const view = buildClientResponsesView(bright, "NEWBATCH");
    expect(view.accepted?.coversCurrentFiles).toBe(false);
    const closure = buildClosureSummary(view, facts());
    expect(closure.rows[0].value).toContain("earlier set");
    expect(closure.acceptedButNotCompleted).toBe(false);
  });
});

describe("closure summary (read-only)", () => {
  const view = buildClientResponsesView(bright, BATCH);
  const row = (rows: { label: string; value: string }[], label: string) => rows.find((r) => r.label === label)!.value;
  it("Bright today: accepted, but retention / Final Approved / engagement / request are all still open", () => {
    const c = buildClosureSummary(view, facts());
    expect(c.acceptedButNotCompleted).toBe(true);
    expect(row(c.rows, "Client accepted delivery")).toBe("Yes");
    expect(row(c.rows, "Outstanding corrections")).toBe("No");
    expect(row(c.rows, "Released photographs")).toBe("21");
    expect(row(c.rows, "Retention protection completed")).toContain("No — 0 of 21");
    expect(row(c.rows, "Final Approved file requirement met")).toContain("No");
    expect(row(c.rows, "Engagement completed")).toBe("No — engagement active");
    expect(row(c.rows, "Crew Support request completed")).toBe("No — in production");
    expect(row(c.rows, "Crew payable")).toBe("approved, unpaid — QAR 1000.00");
  });
  it("turns green only when the real conditions hold", () => {
    const c = buildClosureSummary(view, facts({ protectedCount: 21, finalApprovedCount: 1, engagementStatus: "completed", requestStatus: "completed" }));
    expect(row(c.rows, "Retention protection completed")).toBe("Yes");
    expect(row(c.rows, "Final Approved file requirement met")).toBe("Yes (1)");
    expect(row(c.rows, "Engagement completed")).toBe("Yes");
    expect(row(c.rows, "Crew Support request completed")).toBe("Yes");
    expect(c.acceptedButNotCompleted).toBe(false);
  });
  it("corrections: pending requests or a correction after acceptance are outstanding; unreadable is Unknown", () => {
    expect(row(buildClosureSummary(view, facts({ pendingCorrectionRequests: 2 })).rows, "Outstanding corrections")).toContain("Yes — 2 pending");
    expect(row(buildClosureSummary(view, facts({ pendingCorrectionRequests: null })).rows, "Outstanding corrections")).toBe("Unknown");
    const later = buildClientResponsesView([...bright, { at: "2026-10-23T08:00:00Z", action: "client_delivery.corrections_requested", metadata: { batch: BATCH, remarks: "Brighten HD 7" } }], BATCH);
    expect(row(buildClosureSummary(later, facts()).rows, "Outstanding corrections")).toContain("Yes");
  });
});

// ------------------------------------------------------------------ professional access
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
function builder(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
    in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return b; },
    order: () => b,
    limit: () => b,
    maybeSingle: () => Promise.resolve({ data: (db[table] ?? []).filter((r) => filters.every((f) => f(r)))[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: (db[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }).then(ok),
  };
  return b;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: builder }) }));
import { loadClientFeedbackForProfessional } from "./clientResponses";

describe("the assigned professional sees feedback about their OWN assignment only", () => {
  beforeEach(() => {
    db.engagements = [{ id: "eng-1", entity_type: "crew_support_slot", entity_id: "slot-1", payee_profile_id: "pro-1" }];
    db.crew_support_slots = [{ id: "slot-1", request_id: "req-1" }];
    db.crew_support_requests = [{ id: "req-1", enquiry_id: "enq-1", reference_number: "CSR-2026-000002" }];
    db.activity_log = bright.map((e) => ({ action: e.action, created_at: e.at, metadata: e.metadata, entity_id: "enq-1" }));
  });
  it("the assigned professional gets the client's responses - rating, categories and comment - and nothing internal", async () => {
    const f = await loadClientFeedbackForProfessional("eng-1", "pro-1");
    expect(f).toMatchObject({ reference: "CSR-2026-000002", acceptedAt: "2026-10-22T13:34:56Z", receiptAt: null, rating: { overall: 8, comment: "See me in my office" } });
    expect(f?.rating?.categories.map((c) => c.label)).toEqual(["Photography quality", "Professionalism", "Communication", "Punctuality"]);
    expect(Object.keys(f ?? {}).sort()).toEqual(["acceptedAt", "correctionRequests", "rating", "receiptAt", "reference"]);
  });
  it("anyone else - even another administrator or professional - gets nothing from this loader", async () => {
    expect(await loadClientFeedbackForProfessional("eng-1", "someone-else")).toBeNull();
    expect(await loadClientFeedbackForProfessional("missing", "pro-1")).toBeNull();
  });
  it("a non-crew engagement is never exposed", async () => {
    db.engagements[0].entity_type = "workshop";
    expect(await loadClientFeedbackForProfessional("eng-1", "pro-1")).toBeNull();
  });
  it("nothing to show before the client has responded", async () => {
    db.activity_log = [];
    expect(await loadClientFeedbackForProfessional("eng-1", "pro-1")).toBeNull();
  });
});
