import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/lib/legal/fakeAdmin.testkit";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, logged: [] as { action: string; metadata: Record<string, unknown> }[] }));
vi.mock("@/lib/supabase/admin", async () => {
  const { fakeAdmin: make } = await import("@/lib/legal/fakeAdmin.testkit");
  return { createAdminClient: () => make(h.db) };
});
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: async (e: { action: string; metadata: Record<string, unknown> }) => { h.logged.push(e); } }));
vi.mock("@/lib/organization/authority", () => ({ isSuperAdminId: async (id: string) => id === "super", hasAuthority: async () => true }));

import { parsePermitActivities, recordCommercialPermit, PERMIT_CROSS_CHECK_NOTE, PREMISES_FOUNDER_CONFIRMED } from "./entityRegistrations";

const Q = "ent-qatar", OTHER = "ent-other";
const base = () => ({
  entityId: Q, permitNumber: "345520", issuedOn: "2026-10-26", expiresOn: "2027-10-21", issuingAuthority: "Ministry of Commerce and Industry — Department of Commercial Registration & Permits",
  premisesAddress: "Zone 27, Street 950, Building 20, Floor 1, Unit 0", sourceDocumentId: "d-permit", actorUserId: "super",
  founderCrossChecked: true, premisesConfirmedByFounder: true, siteClassification: "Commercial", activities: [{ code: "742010", name: "Photographic activities" }],
  restrictions: "Practicing any activity not explicitly listed in the license is prohibited. Practicing the licensed activity in villas is not permitted.",
});
const cr = { id: "r-cr", employing_entity_id: Q, kind: "commercial_registration", status: "active", identifier: "CR-1", verified_at: "2026-10-15T00:00:00Z", facts: { activities: [{ code: "742010" }] }, note: "CR note" };
const card = { id: "r-card", employing_entity_id: Q, kind: "establishment_card", status: "active", identifier: "EC-1", verified_at: "2026-10-15T00:00:00Z", facts: { sector: "x" }, note: "card note" };
const pending = { id: "r-pending", employing_entity_id: Q, kind: "commercial_permit", status: "not_issued", identifier: null, verified_at: null, facts: {}, note: "Not yet issued." };
const docs = [
  { id: "d-permit", employing_entity_id: Q, document_type: "commercial_permit" }, { id: "d-receipt", employing_entity_id: Q, document_type: "government_receipt" },
  { id: "d-other-entity", employing_entity_id: OTHER, document_type: "commercial_permit" },
];
const permits = () => h.db.tables.entity_registrations.filter((r) => r.kind === "commercial_permit");

beforeEach(() => {
  h.logged = [];
  h.db = makeFakeDb({ entity_registrations: [cr, card, pending], employing_entity_documents: docs, entity_activities: [], entity_expenses: [], activity_log: [] });
});

describe("recordCommercialPermit: the issued permit is recorded from the uploaded document, as a cross-check, never as a government verification", () => {
  it("records the permit with every printed fact, the Founder cross-check and the Founder's premises confirmation; the pending record is kept as superseded history", async () => {
    const before = JSON.stringify([cr, card]);
    const r = await recordCommercialPermit(base());
    expect(r.ok).toBe(true);
    const active = permits().find((x) => x.status === "active")!;
    expect(active).toMatchObject({ identifier: "345520", issued_on: "2026-10-26", valid_from: "2026-10-26", expires_on: "2027-10-21", source_document_id: "d-permit", supersedes_id: "r-pending", recorded_by: "super" });
    expect(active.facts).toEqual({
      premises: "Zone 27, Street 950, Building 20, Floor 1, Unit 0", premisesBasis: PREMISES_FOUNDER_CONFIRMED, siteClassification: "Commercial",
      activities: [{ code: "742010", name: "Photographic activities" }], restrictions: expect.stringContaining("not explicitly listed"),
    });
    expect(active.verified_by).toBe("super");
    expect(typeof active.verified_at).toBe("string");
    expect(active.note).toBe(PERMIT_CROSS_CHECK_NOTE);
    // honesty of the wording: a cross-check, explicitly NOT the authority's records or the QR portal
    expect(PERMIT_CROSS_CHECK_NOTE).toMatch(/cross-checked; not checked against the issuing authority's records or the QR verification portal/);
    expect(PREMISES_FOUNDER_CONFIRMED).toMatch(/not_a_government_inspection/);
    // history is preserved: the old record is still there, retired, not deleted or overwritten with permit data
    expect(permits().find((x) => x.id === "r-pending")).toMatchObject({ status: "superseded", identifier: null, note: "Not yet issued." });
    expect(permits()).toHaveLength(2);
    // the commercial registration and the establishment card are untouched, byte for byte
    expect(JSON.stringify(h.db.tables.entity_registrations.filter((x) => x.kind !== "commercial_permit"))).toBe(before);
    expect(h.db.writes.filter((w) => w.table !== "entity_registrations")).toEqual([]);
    expect(h.logged).toEqual([{ actorUserId: "super", action: "entity_registration.permit_recorded", entityType: "employing_entity", entityId: Q, metadata: { registrationId: active.id, documentId: "d-permit", crossCheckedByFounder: true, activityCodes: ["742010"] } }]);
  });
  it("without the cross-check the permit is recorded as NOT verified and carries no verification note", async () => {
    expect((await recordCommercialPermit({ ...base(), founderCrossChecked: false, premisesConfirmedByFounder: false })).ok).toBe(true);
    const active = permits().find((x) => x.status === "active")!;
    expect(active.verified_by).toBeUndefined();
    expect(active.verified_at).toBeUndefined();
    expect(active.note).toBeNull();
    expect(active.facts).not.toHaveProperty("premisesBasis");
  });
  it("stores only what is printed: the one licensed activity, and no entity-activity or other licence is created for any other activity", async () => {
    await recordCommercialPermit(base());
    expect((permits().find((x) => x.status === "active")!.facts as { activities: unknown[] }).activities).toHaveLength(1);
    expect(h.db.tables.entity_activities).toEqual([]);
    expect(h.db.writes.filter((w) => w.table === "entity_activities")).toEqual([]);
  });
  it("accepts a permit with no extra details (existing callers keep working)", async () => {
    const r = await recordCommercialPermit({ entityId: Q, permitNumber: "345520", issuedOn: "2026-10-26", expiresOn: null, issuingAuthority: "Authority", premisesAddress: "Zone 27, Street 950", sourceDocumentId: "d-permit", actorUserId: "super" });
    expect(r.ok).toBe(true);
    expect(permits().find((x) => x.status === "active")!.facts).toEqual({ premises: "Zone 27, Street 950" });
  });
});

describe("recordCommercialPermit: refusals and duplicate prevention", () => {
  const refused = async (over: Partial<ReturnType<typeof base>>) => { const r = await recordCommercialPermit({ ...base(), ...over }); return r.ok ? "" : r.error; };
  const unchanged = () => { expect(permits()).toHaveLength(1); expect(permits()[0]).toMatchObject({ id: "r-pending", status: "not_issued" }); expect(h.logged).toEqual([]); };

  it("refuses anyone but a Super Admin, a document that is not in this entity's vault, and one that is not classed as a permit", async () => {
    expect(await refused({ actorUserId: "staff" })).toMatch(/Super Admin|authori/i);
    expect(await refused({ sourceDocumentId: "d-other-entity" })).toMatch(/Upload the permit document/);
    expect(await refused({ sourceDocumentId: "nope" })).toMatch(/Upload the permit document/);
    expect(await refused({ sourceDocumentId: "d-receipt" })).toMatch(/not classed as a Commercial Permit/);
    unchanged();
  });
  it("refuses malformed numbers, dates, premises, authority and activities", async () => {
    expect(await refused({ permitNumber: "" })).toMatch(/permit number/);
    expect(await refused({ issuedOn: "26/10/2026" })).toMatch(/issued/);
    expect(await refused({ expiresOn: "2026-10-01" })).toMatch(/expiry/);
    expect(await refused({ premisesAddress: "x" })).toMatch(/premises/);
    expect(await refused({ issuingAuthority: "" })).toMatch(/issuing authority/);
    expect(await refused({ activities: [{ code: "ABC", name: "Photographic activities" }] })).toMatch(/printed code and name/);
    expect(await refused({ activities: [{ code: "742010", name: "x" }] })).toMatch(/printed code and name/);
    expect(await refused({ activities: [{ code: "742010", name: "Photographic activities" }, { code: "742010", name: "Photographic activities" }] })).toMatch(/twice/);
    unchanged();
  });
  it("refuses when the entity has no active commercial registration", async () => {
    h.db.tables.entity_registrations = [{ ...cr, status: "expired" }, card, pending];
    expect(await refused({})).toMatch(/no active commercial registration/);
  });
  it("never records a second permit: not while one is active, and not under a number that already exists for any entity or any status", async () => {
    expect((await recordCommercialPermit(base())).ok).toBe(true);
    expect(await refused({ permitNumber: "999999" })).toMatch(/already recorded/);          // an active permit exists
    h.db.tables.entity_registrations = [cr, card, { ...pending, id: "r-pending-2", employing_entity_id: OTHER, kind: "commercial_registration", status: "active" }, { id: "x", employing_entity_id: OTHER, kind: "commercial_permit", status: "superseded", identifier: "777777" }];
    h.db.tables.entity_registrations.push({ ...pending });
    expect(await refused({ permitNumber: "777777" })).toMatch(/already recorded, so it was not recorded again/);   // same number elsewhere, even if superseded
    expect(permits().filter((x) => x.status === "active")).toHaveLength(0);
  });
  it("restores the pending record if the new permit cannot be written (no half-finished state)", async () => {
    h.db.failInsert = new Set(["entity_registrations"]);
    const r = await recordCommercialPermit(base());
    expect(r.ok).toBe(false);
    expect(permits()).toHaveLength(1);
    expect(permits()[0]).toMatchObject({ id: "r-pending", status: "not_issued" });
    expect(h.logged).toEqual([]);
  });
});

describe("parsePermitActivities", () => {
  it("reads one 'code | name' per line, exactly as printed", () => {
    expect(parsePermitActivities("742010 | Photographic activities")).toEqual({ ok: true, activities: [{ code: "742010", name: "Photographic activities" }] });
    expect(parsePermitActivities("742010 - Photographic activities\n\n591110 | Motion picture production")).toEqual({ ok: true, activities: [{ code: "742010", name: "Photographic activities" }, { code: "591110", name: "Motion picture production" }] });
    expect(parsePermitActivities("")).toEqual({ ok: true, activities: [] });
    expect(parsePermitActivities(null)).toEqual({ ok: true, activities: [] });
  });
  it("refuses what it cannot read instead of guessing, and repeated codes", () => {
    for (const bad of ["Photographic activities", "7420 |", "abc | Photographic activities", "742010 | x"]) expect(parsePermitActivities(bad).ok, bad).toBe(false);
    expect(parsePermitActivities("742010 | Photographic activities\n742010 | Photographic activities")).toEqual({ ok: false, error: "Activity code 742010 is listed twice." });
  });
});
