import { beforeEach, describe, expect, it, vi } from "vitest";

// Fail-safe email suppression and placeholder-address safeguards. These run real code against a mocked database client (no database, no network).

const db = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as null | { code?: string; message: string } },
  throws: false,
  calls: 0,
  tables: [] as string[],
}));
const dispatched = vi.hoisted(() => ({ count: 0 }));
const failures = vi.hoisted(() => ({ logged: [] as { emailType: string; recipient: string }[] }));

function chain(): unknown {
  const q: Record<string, unknown> = {};
  const self = () => q;
  for (const m of ["select", "eq", "is", "ilike", "update", "not", "limit", "order", "in", "neq"]) q[m] = self;
  q.maybeSingle = async () => {
    if (db.throws) throw new Error("connection reset");
    return db.result;
  };
  q.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null });
  return q;
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (t: string) => { db.calls++; db.tables.push(t); return chain(); } }) }));
vi.mock("@/lib/shared/email/deadLetter", () => ({ logEmailSendFailure: async (p: { emailType: string; recipient: string }) => { failures.logged.push(p); } }));
vi.mock("@/lib/notifications/dispatch", () => ({ dispatchNotification: async () => { dispatched.count++; return { email: { ok: true, mode: "sent", attempts: 1 } }; } }));

import { clientEmailsSuppressed, sendBookingConfirmedEmail, sendFilesReadyEmail, sendQuotationReadyEmail } from "./lifecycleEmails";
import { linkGuestRecordsToAccount } from "@/lib/supabase/accountLinking";
import { initiateGatewayCheckout } from "@/lib/payments/checkoutService";
import { isPlaceholderEmail, placeholderEmailFor } from "@/lib/shared/email/placeholder";

beforeEach(() => {
  db.result = { data: null, error: null };
  db.throws = false;
  db.calls = 0;
  db.tables = [];
  dispatched.count = 0;
  failures.logged = [];
});

describe("the suppression check fails safe", () => {
  it("suppresses when the flag is set", async () => {
    db.result = { data: { email_notifications_suppressed: true, created_by: "staff-1" }, error: null };
    expect(await clientEmailsSuppressed("e1")).toBe(true);
  });
  it("does NOT suppress an established website enquiry (flag false, no author)", async () => {
    db.result = { data: { email_notifications_suppressed: false, created_by: null }, error: null };
    expect(await clientEmailsSuppressed("e1")).toBe(false);
  });
  it("suppresses a staff-recorded enquiry unless the flag is an explicit false", async () => {
    db.result = { data: { email_notifications_suppressed: null, created_by: "staff-1" }, error: null };
    expect(await clientEmailsSuppressed("e1")).toBe(true);
    db.result = { data: { email_notifications_suppressed: false, created_by: "staff-1" }, error: null };
    expect(await clientEmailsSuppressed("e1")).toBe(false);
  });
  it("suppresses, and logs for follow-up, when the lookup fails", async () => {
    db.result = { data: null, error: { code: "57014", message: "statement timeout" } };
    expect(await clientEmailsSuppressed("e1", "enquiry-quotation-ready")).toBe(true);
    expect(failures.logged).toEqual([{ emailType: "suppression-check:enquiry-quotation-ready", recipient: "enquiry:e1", referenceNumber: null, errorMessage: "suppression check indeterminate: statement timeout", attempts: 0, permanent: false }]);
  });
  it("suppresses, and logs, when the lookup throws or the enquiry cannot be found", async () => {
    db.throws = true;
    expect(await clientEmailsSuppressed("e1")).toBe(true);
    db.throws = false;
    db.result = { data: null, error: null };
    expect(await clientEmailsSuppressed("e1")).toBe(true);
    expect(failures.logged).toHaveLength(2);
  });
  it("keeps established behaviour only where the intake columns do not exist yet (before the migration), because no enquiry can be staff-recorded there", async () => {
    db.result = { data: null, error: { code: "42703", message: 'column "email_notifications_suppressed" does not exist' } };
    expect(await clientEmailsSuppressed("e1")).toBe(false);
    expect(failures.logged).toHaveLength(0);
  });
  it("is not tied to an enquiry means nothing to suppress", async () => {
    expect(await clientEmailsSuppressed(null)).toBe(false);
    expect(db.calls).toBe(0);
  });
});

describe("the three client emails send nothing when the check is indeterminate or suppressed, and still send for unaffected enquiries", () => {
  const q = { enquiryId: "e1", referenceNumber: "ENQ-2026-000001", fullName: "Test Person", email: "client@example.com", service: "photography", amountDue: 100 };
  const b = { enquiryId: "e1", referenceNumber: "ENQ-2026-000001", fullName: "Test Person", email: "client@example.com", service: "photography" };
  const f = { entityId: "e1", portalKind: "enquiry" as const, referenceNumber: "ENQ-2026-000001", fullName: "Test Person", email: "client@example.com", projectLabel: "Photography", deliverableTitle: "Final files" };

  it("sends nothing when the lookup fails", async () => {
    db.result = { data: null, error: { code: "08006", message: "connection failure" } };
    expect(await sendQuotationReadyEmail(q)).toBeNull();
    expect(await sendBookingConfirmedEmail(b)).toBeNull();
    expect(await sendFilesReadyEmail(f as never)).toBeNull();
    expect(dispatched.count).toBe(0);
  });
  it("sends nothing for a suppressed (staff-recorded) enquiry", async () => {
    db.result = { data: { email_notifications_suppressed: true, created_by: "staff-1" }, error: null };
    expect(await sendQuotationReadyEmail(q)).toBeNull();
    expect(await sendBookingConfirmedEmail(b)).toBeNull();
    expect(await sendFilesReadyEmail(f as never)).toBeNull();
    expect(dispatched.count).toBe(0);
  });
  it("still sends for an unaffected website enquiry, so established notifications are preserved", async () => {
    db.result = { data: { email_notifications_suppressed: false, created_by: null }, error: null };
    expect(await sendQuotationReadyEmail(q)).toMatchObject({ ok: true });
    expect(await sendBookingConfirmedEmail(b)).toMatchObject({ ok: true });
    expect(await sendFilesReadyEmail(f as never)).toMatchObject({ ok: true });
    expect(dispatched.count).toBe(3);
  });
  it("a workshop files-ready email is not an enquiry email and is not checked", async () => {
    expect(await sendFilesReadyEmail({ ...f, portalKind: "workshop" } as never)).toMatchObject({ ok: true });
    expect(db.calls).toBe(0);
  });
});

describe("a placeholder address is never an identity, a payment email, or shared", () => {
  it("is unique per reference across a large range, so two enquiries can never share one", () => {
    const seen = new Set<string>();
    for (const year of [2026, 2027]) for (let n = 1; n <= 3000; n++) seen.add(placeholderEmailFor(`ENQ-${year}-${String(n).padStart(6, "0")}`));
    expect(seen.size).toBe(6000);
    expect([...seen].every((e) => isPlaceholderEmail(e))).toBe(true);
  });
  it("cannot claim records through account linking, and a real address still can", async () => {
    await linkGuestRecordsToAccount("user-1", "enq-2026-000010@no-email.invalid");
    expect(db.calls).toBe(0);
    await linkGuestRecordsToAccount("user-1", "client@example.com");
    expect(db.tables).toContain("enquiries");
  });
  it("cannot start a gateway checkout", async () => {
    const r = await initiateGatewayCheckout({ entityType: "enquiry", entityId: "e1", paymentType: "full", country: "GH", userId: "u1", email: "enq-2026-000010@no-email.invalid", callbackUrlBase: "https://example.com", quotedConvertedAmount: 100 } as never);
    expect(r).toEqual({ ok: false, error: "no-deliverable-email" });
    expect(db.calls).toBe(0);
  });
});
