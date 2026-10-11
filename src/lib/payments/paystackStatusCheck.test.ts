import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assessPaystackStatus, formatAssessment } from "./paystackStatusCheck";

const payment = { converted_amount: "3046.70", payment_currency: "GHS" };
const ev = (status: "completed" | "failed" | "refunded" | "unknown", amount: number | null, currency: string | null, raw: unknown) =>
  ({ status, amount, currency, channel: "card" as const, raw: raw as Record<string, unknown> });

describe("read-only Paystack status assessment", () => {
  it("success with the locked amount: says reconcile would complete and credit", () => {
    const a = assessPaystackStatus(ev("completed", 3046.7, "GHS", { data: { status: "success" } }), payment);
    expect(a.matchesLockedAmount).toBe(true);
    expect(a.paystackStatus).toBe("success");
    expect(a.wouldDo).toMatch(/WOULD mark this payment completed/);
  });
  it("success with a different amount or currency: says reconcile would FAIL it (not credit) and flags manual handling", () => {
    expect(assessPaystackStatus(ev("completed", 3000, "GHS", { data: { status: "success" } }), payment).wouldDo).toMatch(/does NOT match/);
    expect(assessPaystackStatus(ev("completed", 3046.7, "USD", { data: { status: "success" } }), payment).matchesLockedAmount).toBe(false);
  });
  it("abandoned/failed/not found: attempt over, row and history stay", () => {
    expect(assessPaystackStatus(ev("failed", null, null, { data: { status: "abandoned" } }), payment).wouldDo).toMatch(/history stay/);
    const nf = assessPaystackStatus(ev("failed", null, null, { status: false, message: "Transaction reference not found" }), payment);
    expect(nf.paystackStatus).toMatch(/not found/);
  });
  it("ongoing: nothing would change", () => {
    expect(assessPaystackStatus(ev("unknown", null, null, { data: { status: "ongoing" } }), payment).wouldDo).toMatch(/change nothing/);
  });
  it("the summary always says nothing was changed", () => {
    expect(formatAssessment(assessPaystackStatus(ev("unknown", null, null, { data: { status: "pending" } }), payment))).toMatch(/Nothing was changed by this check/);
  });
  it("the action is read-only: it never writes to payments or any financial table", () => {
    const src = readFileSync("src/app/admin/payments/actions.ts", "utf8");
    const body = src.slice(src.indexOf("export async function checkPaystackStatusAction"), src.indexOf("export async function retryReceiptJobAction"));
    const code = body.replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    expect(code).not.toMatch(/reconcilePendingGatewayPayment|applyGatewayEventToPayment|syncEntityPaymentStatus/);
    expect(code).toContain('requireCapability("reconcile_payment")');
  });
});
