import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CancellationMoneyCard from "./CancellationMoneyCard";
const row = (o: Record<string, unknown>) => ({ id: "d1", kind: "refund", amount_usd: 600, reason: "client withdrew; refund agreed in writing", evidence_ref: "Letter ref CL-2026-014", status: "requested", requested_by: "req", requested_at: "2026-11-10T01:00:00Z", decided_by: null, decided_at: null, decision_note: null, executed_reference: null, executed_by: null, executed_at: null, requestedLabel: "INT0002 — Admin A", ...o });
const html = (p: Record<string, unknown>) => renderToStaticMarkup(createElement(CancellationMoneyCard as never, { enquiryId: "e1", rows: [], money: null, level: "super_admin", viewerId: "sa1", finalCancelled: true, ...p }));
describe("the cancellation money card", () => {
  it("is absent for a booking that is not finally cancelled and has no records", () => { expect(html({ finalCancelled: false })).toBe(""); });
  it("after a final cancellation anyone allowed can record a request; the card says nothing moves money", () => { for (const level of ["admin", "super_admin"]) { const h = html({ level }); expect(h).toContain("Record the request"); expect(h).toMatch(/never moves money/); } });
  it("an Admin never sees authorise or decline and never the balances; a Super Admin sees the balances", () => { const rows = [row({})]; const a = html({ level: "admin", rows, viewerId: "adm" }); expect(a).not.toContain("Authorise"); expect(a).toContain("Waiting for a different Super Admin"); expect(a).not.toMatch(/Verified paid/); expect(html({ money: { paidUsd: 1000, outstandingUsd: 0 } })).toContain("Verified paid: $1000.00"); });
  it("the Super Admin who made the request cannot decide it; a different one can", () => { const rows = [row({ requested_by: "sa1" })]; expect(html({ rows })).not.toContain("Authorise"); expect(html({ rows })).toContain("Waiting for a different Super Admin"); expect(html({ rows: [row({})] })).toContain("Authorise"); });
  it("an authorised request offers 'record that it was carried out' to a Super Admin only, and a carried-out one offers nothing more", () => {
    const auth = [row({ status: "authorised", decided_by: "sa2", decided_at: "2026-11-10T02:00:00Z", decision_note: "Checked the letter", decidedLabel: "INT0001 — Super" })];
    expect(html({ rows: auth })).toContain("Record that it was carried out"); expect(html({ level: "admin", rows: auth })).not.toContain("Record that it was carried out");
    const done = [row({ ...auth[0], executed_reference: "RF-2026-0007", executed_at: "2026-11-10T03:00:00Z", executed_by: "sa1" })]; const h = html({ rows: done }); expect(h).not.toContain("Record that it was carried out"); expect(h).toContain("RF-2026-0007");
  });
});
