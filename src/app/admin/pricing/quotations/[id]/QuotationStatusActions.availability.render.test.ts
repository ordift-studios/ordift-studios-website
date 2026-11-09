import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({ issueQuotationAction: async () => null, recordQuotationAcceptanceAction: async () => null, recordQuotationDeliveryAction: async () => null, updateQuotationStatusAction: async () => null }));
import { QuotationStatusActions } from "./QuotationStatusActions";
import type { QuotationAvailabilityContext } from "@/lib/bookings/quotationAvailabilityService";

const ctx = (o: Partial<QuotationAvailabilityContext> = {}): QuotationAvailabilityContext => ({ applies: true, hasEnquiry: true, latestLabel: "Tentatively available", latestAt: "2026-11-09T10:00:00Z", latestStale: false, outlook: { outcome: "conditional", message: "x" }, ...o });
const html = (availability: QuotationAvailabilityContext | null) => renderToStaticMarkup(createElement(QuotationStatusActions, { quotationId: "q1", status: "draft", defaultValidUntil: "2026-12-10", isSuperAdmin: false, blockers: [], expired: false, today: "2026-11-10", availability } as never));

describe("the Issue form's availability basis", () => {
  it("shows the required availability basis with both choices unselected, and says an availability check is not a reservation or a booking", () => {
    const h = html(ctx());
    expect(h).toContain("Availability basis (required)"); expect(h).toContain("depends on a specific person and service time"); expect(h).toContain("does not depend on a specific person or time");
    expect(h).toContain("not a reservation or a booking"); expect(h).not.toMatch(/name="availabilityBasis"[^>]*checked/);
  });
  it("shows nothing about availability while the switch is off (no context)", () => { expect(html(null)).not.toContain("Availability basis"); });
});
