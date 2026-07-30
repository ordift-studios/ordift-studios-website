import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestAdminClient, testRunId } from "@/lib/testing/testEnvironment";

// Per your explicit instruction: do not send real email in routine
// automated tests. Resend is stubbed at the HTTP boundary (the `Resend`
// class itself) per INTEGRATION_TESTING_STRATEGY.md §2/§5 — this test
// proves the platform's retry/backoff/classification/dead-letter logic
// is correct without ever touching Resend's real API or its 100/day
// free-tier quota. The dead-letter write it produces IS real (Supabase,
// email_send_failures table) — that half is worth testing for real,
// same reasoning as the Sheets dead-letter test.

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock("resend", () => ({
  // Must be a real constructor (dispatch.ts calls `new Resend(apiKey)`)
  // — an arrow-function implementation isn't constructible, so this
  // uses a plain function assigning to `this` instead.
  Resend: vi.fn(function (this: { emails: { send: typeof mockSend } }) {
    this.emails = { send: mockSend };
  }),
}));

// sendEmailNow only proceeds past its config check with these present;
// no real credential is used since Resend itself is mocked above.
process.env.RESEND_API_KEY = "test-mock-key";
process.env.EMAIL_FROM_ADDRESS = "test@ordiftstudios.invalid";

const { sendEmailNow } = await import("./dispatch");

const runId = testRunId();
const admin = createTestAdminClient();

beforeEach(() => {
  mockSend.mockReset();
});

describe("sendEmailNow — retry/backoff/classification (Resend stubbed)", () => {
  it("returns ok:sent on the first attempt when Resend succeeds immediately", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "mock-id" }, error: null });

    const result = await sendEmailNow({
      to: "client@ordiftstudios.invalid",
      subject: "Test",
      html: "<p>test</p>",
      text: "test",
      logPrefix: "[test]",
      emailType: "integration-test",
      referenceNumber: null,
    });

    expect(result).toEqual({ ok: true, mode: "sent", attempts: 1 });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("retries on a transient (5xx) failure and succeeds on the second attempt", async () => {
    mockSend
      .mockResolvedValueOnce({ data: null, error: { statusCode: 503, name: "ServiceUnavailable", message: "temporary" } })
      .mockResolvedValueOnce({ data: { id: "mock-id" }, error: null });

    const result = await sendEmailNow({
      to: "client@ordiftstudios.invalid",
      subject: "Test",
      html: "<p>test</p>",
      text: "test",
      logPrefix: "[test]",
      emailType: "integration-test",
      referenceNumber: null,
    });

    expect(result).toEqual({ ok: true, mode: "sent", attempts: 2 });
    expect(mockSend).toHaveBeenCalledTimes(2);
  }, 10000);

  it("retries on a 429 (rate limited) the same as a transient failure", async () => {
    mockSend
      .mockResolvedValueOnce({ data: null, error: { statusCode: 429, name: "RateLimited", message: "slow down" } })
      .mockResolvedValueOnce({ data: { id: "mock-id" }, error: null });

    const result = await sendEmailNow({
      to: "client@ordiftstudios.invalid",
      subject: "Test",
      html: "<p>test</p>",
      text: "test",
      logPrefix: "[test]",
      emailType: "integration-test",
      referenceNumber: null,
    });

    expect(result.ok).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(2);
  }, 10000);

  it("fails fast on a permanent (4xx, non-429) failure — never retries — and writes a real dead-letter row", async () => {
    const referenceNumber = `TEST-email-permanent-${runId}`;
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { statusCode: 422, name: "ValidationError", message: "invalid recipient" },
    });

    const result = await sendEmailNow({
      to: "not-a-real-address",
      subject: "Test",
      html: "<p>test</p>",
      text: "test",
      logPrefix: "[test]",
      emailType: "integration-test",
      referenceNumber,
    });

    expect(result).toEqual({ ok: false, error: "invalid recipient", attempts: 1, permanent: true });
    expect(mockSend).toHaveBeenCalledTimes(1); // fails fast, never retries a permanent error

    const { data, error } = await admin
      .from("email_send_failures")
      .select("id, permanent, attempts, error_message")
      .eq("reference_number", referenceNumber);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].permanent).toBe(true);
    expect(data![0].attempts).toBe(1);
  });

  it("exhausts all 3 attempts on a persistent transient failure, then writes a real dead-letter row", async () => {
    const referenceNumber = `TEST-email-exhausted-${runId}`;
    mockSend.mockResolvedValue({ data: null, error: { statusCode: 500, name: "ServerError", message: "always fails" } });

    const result = await sendEmailNow({
      to: "client@ordiftstudios.invalid",
      subject: "Test",
      html: "<p>test</p>",
      text: "test",
      logPrefix: "[test]",
      emailType: "integration-test",
      referenceNumber,
    });

    expect(result).toEqual({ ok: false, error: "always fails", attempts: 3, permanent: false });
    expect(mockSend).toHaveBeenCalledTimes(3);

    const { data, error } = await admin
      .from("email_send_failures")
      .select("id, permanent, attempts")
      .eq("reference_number", referenceNumber);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].permanent).toBe(false);
    expect(data![0].attempts).toBe(3);
  }, 10000);

  afterAll(async () => {
    const { error } = await admin
      .from("email_send_failures")
      .delete()
      .in("reference_number", [`TEST-email-permanent-${runId}`, `TEST-email-exhausted-${runId}`]);
    if (error) {
      console.error(
        `[dispatch.integration] CLEANUP FAILED for run ${runId} — could not delete email_send_failures rows: ${error.message}. ` +
          `Log to TECHNICAL_DEBT_REGISTER.md.`
      );
    }
  });
});
