import { describe, expect, it } from "vitest";
import { isTicketTypeCurrentlyOnSale } from "@/lib/workshops/ticketTypes";

describe("isTicketTypeCurrentlyOnSale", () => {
  const now = new Date("2026-08-25T12:00:00Z");

  it("is on sale when active with no sale window set", () => {
    expect(isTicketTypeCurrentlyOnSale({ active: true, saleStartsAt: null, saleEndsAt: null }, now)).toBe(true);
  });

  it("is never on sale when inactive, regardless of window", () => {
    expect(isTicketTypeCurrentlyOnSale({ active: false, saleStartsAt: null, saleEndsAt: null }, now)).toBe(false);
  });

  it("is not yet on sale before saleStartsAt", () => {
    expect(
      isTicketTypeCurrentlyOnSale({ active: true, saleStartsAt: "2026-09-01T00:00:00Z", saleEndsAt: null }, now)
    ).toBe(false);
  });

  it("is on sale once saleStartsAt has passed", () => {
    expect(
      isTicketTypeCurrentlyOnSale({ active: true, saleStartsAt: "2026-08-01T00:00:00Z", saleEndsAt: null }, now)
    ).toBe(true);
  });

  it("is no longer on sale after saleEndsAt", () => {
    expect(
      isTicketTypeCurrentlyOnSale({ active: true, saleStartsAt: null, saleEndsAt: "2026-08-01T00:00:00Z" }, now)
    ).toBe(false);
  });

  it("is on sale within an open window", () => {
    expect(
      isTicketTypeCurrentlyOnSale(
        { active: true, saleStartsAt: "2026-08-01T00:00:00Z", saleEndsAt: "2026-09-01T00:00:00Z" },
        now
      )
    ).toBe(true);
  });
});
