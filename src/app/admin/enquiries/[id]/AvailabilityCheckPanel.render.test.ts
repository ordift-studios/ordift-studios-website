import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./availabilityActions", () => ({ checkAvailabilityAction: async () => ({ ok: false, error: "x" }) }));
import AvailabilityCheckPanel from "./AvailabilityCheckPanel";
import type { AvailabilityPanelData } from "@/lib/bookings/availabilityService";

const data = (o: Partial<AvailabilityPanelData> = {}): AvailabilityPanelData => ({ people: [{ id: "p1", name: "Kofi" }, { id: "p2", name: "Ama" }], latest: null, seeReferences: false, ...o });
const html = (d: AvailabilityPanelData) => renderToStaticMarkup(createElement(AvailabilityCheckPanel, { enquiryId: "e1", data: d }));

describe("AvailabilityCheckPanel", () => {
  it("says at the top that this is not a reservation or a confirmed booking, and that it is repeated at confirmation", () => {
    const h = html(data()); expect(h).toContain("not a reservation or a confirmed booking"); expect(h).toContain("repeated when a booking is confirmed");
  });
  it("lists the team members, offers 'not chosen' (which cannot be checked), and a labelled optional direct-check group", () => {
    const h = html(data()); expect(h).toContain("Not chosen yet (cannot be checked)"); expect(h).toContain("Kofi"); expect(h).toContain("Ama");
    expect(h).toContain("Did you check directly with the person?"); expect(h).toContain("I checked directly with the assigned person.");
  });
  it("shows the last check with its checker's member number, and warns when it is old", () => {
    const h = html(data({ latest: { state: "tentative", label: "Tentatively available", at: "2026-11-01T10:00:00Z", byLabel: "member INT0007", start: null, stale: true } }));
    expect(h).toContain("Tentatively available"); expect(h).toContain("member INT0007"); expect(h).toContain("older than 7 days");
    expect(html(data())).toContain("No availability check has been made");
  });
  it("has one action only: check availability. No book, confirm, hold or quote control exists on it", () => {
    const buttons = [...html(data()).matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    expect(buttons).toEqual(["Check availability"]);
  });
});
