import { describe, expect, it } from "vitest";
import { summarizeEntityPayments } from "./entityPaymentTotals";

const p = (status: string, usd: number, type = "partial") => ({ status, payment_type: type, reference_amount_usd: usd });

describe("summarizeEntityPayments: the one authoritative calculation", () => {
  it("counts only completed payments: an attempt in any other status is never revenue", () => {
    const rows = [p("completed", 400), ...["pending", "awaiting_verification", "additional_info_required", "failed", "rejected", "refunded"].map((s) => p(s, 999))];
    expect(summarizeEntityPayments(rows, 1000)).toEqual({ totalPaidUsd: 400, paymentStatus: "Pending" });
  });
  it("adds instalments across methods and reports Paid exactly when the total reaches the amount due", () => {
    expect(summarizeEntityPayments([p("completed", 400), p("completed", 300), p("completed", 300)], 1000)).toEqual({ totalPaidUsd: 1000, paymentStatus: "Paid" });
    expect(summarizeEntityPayments([p("completed", 400), p("completed", 300), p("completed", 299.99)], 1000).paymentStatus).toBe("Pending");
  });
  it("subtracts a completed refund, and ignores a refund that is not completed", () => {
    expect(summarizeEntityPayments([p("completed", 1000, "full"), p("completed", 250, "refund")], 1000)).toEqual({ totalPaidUsd: 750, paymentStatus: "Pending" });
    expect(summarizeEntityPayments([p("completed", 1000, "full"), p("pending", 250, "refund")], 1000).totalPaidUsd).toBe(1000);
  });
  it("is Pending with nothing paid or a net of zero or less, and copes with strings, nulls and an unset amount due", () => {
    expect(summarizeEntityPayments([], 500)).toEqual({ totalPaidUsd: 0, paymentStatus: "Pending" });
    expect(summarizeEntityPayments([p("completed", 100, "full"), p("completed", 100, "refund")], 100).paymentStatus).toBe("Pending");
    expect(summarizeEntityPayments([{ status: "completed", payment_type: null, reference_amount_usd: "12.50" }, { status: "completed", payment_type: "partial", reference_amount_usd: null }], "100")).toEqual({ totalPaidUsd: 12.5, paymentStatus: "Pending" });
    expect(summarizeEntityPayments([p("completed", 10)], null).paymentStatus).toBe("Paid");
  });
  it("rounds the stored total to cents without changing the Paid decision", () => {
    expect(summarizeEntityPayments([p("completed", 33.333), p("completed", 33.333), p("completed", 33.334)], 100)).toEqual({ totalPaidUsd: 100, paymentStatus: "Paid" });
  });
});
