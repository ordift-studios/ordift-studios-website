import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { USAGE_RIGHTS_CATEGORIES } from "@/lib/legal/rightsCatalogue";
import { DESTINATIONS, DESTINATION_KEYS, DESTINATION_USAGE_RIGHT, jobKey, parseJobKey } from "./destinations";

const sql = (f: string) => readFileSync(new URL(`../../../supabase/proposals/${f}`, import.meta.url), "utf8");
const permissions = sql("PROPOSED_0170_portfolio_marketing_permissions.sql");
const approval = sql("PROPOSED_0171_portfolio_internal_approval_and_use.sql");

describe("destinations stay in step with the database proposals", () => {
  it("every destination in the app is allowed by the permission and approval tables, and vice versa", () => {
    const listIn = (src: string) => [...src.matchAll(/<@ array\[([^\]]+)\]/g)].map((m) => m[1].replace(/'/g, "").split(",").map((s) => s.trim()).sort().join(","));
    const app = [...DESTINATION_KEYS].sort().join(",");
    for (const l of [...listIn(permissions), ...listIn(approval)].filter((l) => l.includes("portfolio") && l.includes("journal"))) expect(l).toBe(app);
  });
  it("the destination -> usage-right mapping matches the SQL function and uses only real catalogue categories", () => {
    for (const d of DESTINATIONS) {
      expect(USAGE_RIGHTS_CATEGORIES).toContain(DESTINATION_USAGE_RIGHT[d.key]);
      expect(permissions).toMatch(new RegExp(`when '${d.key}'( then '[a-z_]+' when '[a-z_]+')* then '${DESTINATION_USAGE_RIGHT[d.key]}'`));
    }
  });
  it("job keys round-trip and reject anything else", () => {
    const id = "00000000-0000-4000-8000-0000000c0001";
    expect(parseJobKey(jobKey("crew_support_request", id))).toEqual({ jobType: "crew_support_request", jobId: id });
    expect(parseJobKey("engagement:not-a-uuid")).toBeNull();
    expect(parseJobKey("other:" + id)).toBeNull();
    expect(parseJobKey(undefined)).toBeNull();
  });
});
