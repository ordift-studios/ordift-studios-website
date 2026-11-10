// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/lib/legal/fakeAdmin.testkit";
import { validateOwnership } from "./assetOwnershipRules";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, superAdmin: true, log: vi.fn() }));
vi.mock("@/lib/supabase/admin", async () => { const { fakeAdmin } = await import("@/lib/legal/fakeAdmin.testkit"); return { createAdminClient: () => fakeAdmin(h.db) }; });
vi.mock("@/lib/organization/authority", () => ({ isSuperAdminId: async () => h.superAdmin }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: h.log }));
import { linkAcquisitionToAsset, loadAssetRegister, recordAssetOwnership, voidAssetOwnership } from "./assetReconciliation";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01", Q = "11111111-1111-4111-8111-111111111101", G = "11111111-1111-4111-8111-111111111102";
const own = (over: Record<string, unknown> = {}) => ({ assetId: A, entityId: Q, purchaserAsStated: "The Founder, as printed on the receipt", businessPurpose: "Photography retouching and graphic design", incidentalPersonalUse: false, basisStatement: "Founder statement: bought for the company; documents pending", ...over });
const seed = () => {
  h.db = makeFakeDb({ company_assets: [{ id: A, asset_identifier: "SER-1", description: "Synthetic pen display", category: "Pad", status: "in_stock" }],
    entity_asset_ownership: [], entity_equipment_acquisitions: [{ id: "acq-q", employing_entity_id: Q, status: "recorded", company_asset_id: null }, { id: "acq-g", employing_entity_id: G, status: "recorded", company_asset_id: null }] });
  h.db.rpcHandlers = { record_asset_ownership: () => ({ data: "o1", error: null }), void_asset_ownership: () => ({ data: null, error: null }), link_acquisition_to_asset: () => ({ data: null, error: null }) };
};
beforeEach(() => { h.superAdmin = true; h.log.mockReset(); seed(); });

describe("ownership rules (purchaser, owner, purpose and personal use are separate facts)", () => {
  it("accepts the owner decision with purchaser as stated and a business purpose; incidental personal use needs a description", () => {
    expect(validateOwnership(own())).toMatchObject({ ok: true, value: { entityId: Q, purchaserAsStated: "The Founder, as printed on the receipt" } });
    expect(validateOwnership(own({ incidentalPersonalUse: true }))).toMatchObject({ ok: false });
    expect(validateOwnership(own({ incidentalPersonalUse: true, personalUseNote: "Occasional personal use; accountant to review any adjustment" }))).toMatchObject({ ok: true, value: { incidentalPersonalUse: true } });
  });
  it("refuses a vague purpose or basis and a malformed asset/entity", () => {
    for (const bad of [{ businessPurpose: "work" }, { basisStatement: "yes" }, { assetId: "x" }, { entityId: "x" }, { evidenceDocumentId: "nope" }]) expect(validateOwnership(own(bad)), JSON.stringify(bad)).toMatchObject({ ok: false });
  });
});
describe("recordAssetOwnership / voidAssetOwnership", () => {
  it("is Super Admin only, calls ONE audited function and marks the review as pending", async () => {
    h.superAdmin = false;
    expect(await recordAssetOwnership({ actorUserId: "u", ownership: own() })).toMatchObject({ ok: false });
    h.superAdmin = true; let args: Record<string, unknown> = {}; h.db.rpcHandlers!.record_asset_ownership = (a) => { args = a; return { data: "o1", error: null }; };
    expect(await recordAssetOwnership({ actorUserId: "u", ownership: own() })).toEqual({ ok: true });
    expect(args).toMatchObject({ p_asset: A, p_entity: Q, p_personal_use: false, p_actor: "u" });
    expect(h.log).toHaveBeenCalledWith(expect.objectContaining({ action: "asset_ownership.recorded", metadata: expect.objectContaining({ reviewStatus: "pending_professional_review" }) }));
    expect(h.db.writes).toEqual([]);
  });
  it("plain messages for the database's refusals; a void needs a reason and the right entity", async () => {
    h.db.rpcHandlers!.record_asset_ownership = () => ({ data: null, error: { message: 'duplicate key value violates unique constraint "ownership_one_current"' } });
    expect(await recordAssetOwnership({ actorUserId: "u", ownership: own() })).toMatchObject({ ok: false, error: expect.stringMatching(/already has a current ownership record/) });
    h.db.tables.entity_asset_ownership.push({ id: "o1", employing_entity_id: Q });
    expect(await voidAssetOwnership({ actorUserId: "u", entityId: Q, ownershipId: "o1", reason: "short" })).toMatchObject({ ok: false });
    expect(await voidAssetOwnership({ actorUserId: "u", entityId: G, ownershipId: "o1", reason: "recorded against the wrong asset" })).toMatchObject({ ok: false });
    expect(await voidAssetOwnership({ actorUserId: "u", entityId: Q, ownershipId: "o1", reason: "recorded against the wrong asset" })).toEqual({ ok: true });
  });
});
describe("linkAcquisitionToAsset", () => {
  it("links ONE acquisition of the SAME entity through the audited function, with no direct write", async () => {
    expect(await linkAcquisitionToAsset({ actorUserId: "u", entityId: Q, acquisitionId: "acq-q", assetId: A })).toEqual({ ok: true });
    expect(h.log).toHaveBeenCalledWith(expect.objectContaining({ action: "equipment_asset.linked" }));
    expect(h.db.writes).toEqual([]);
  });
  it("keeps Qatar and Ghana apart and refuses non-Super-Admins", async () => {
    expect(await linkAcquisitionToAsset({ actorUserId: "u", entityId: Q, acquisitionId: "acq-g", assetId: A })).toMatchObject({ ok: false });
    h.superAdmin = false;
    expect(await linkAcquisitionToAsset({ actorUserId: "u", entityId: Q, acquisitionId: "acq-q", assetId: A })).toMatchObject({ ok: false });
  });
  it("turns the database refusals (no owner recorded / asset already linked / link already set) into plain messages", async () => {
    for (const [m, re] of [["the asset has no current ownership record for THIS legal entity", /Record this asset's legal owner/], ['violates unique constraint "acquisitions_one_per_asset"', /already linked to this asset/], ["the asset link of an acquisition cannot be changed or cleared", /cannot be changed/]] as const) {
      h.db.rpcHandlers!.link_acquisition_to_asset = () => ({ data: null, error: { message: m } });
      expect(await linkAcquisitionToAsset({ actorUserId: "u", entityId: Q, acquisitionId: "acq-q", assetId: A })).toMatchObject({ ok: false, error: expect.stringMatching(re) });
    }
  });
});
describe("loadAssetRegister (read-only)", () => {
  it("joins the current ownership and the linked acquisition to the asset without writing anything", async () => {
    h.db.tables.entity_asset_ownership.push({ id: "o1", asset_id: A, employing_entity_id: Q, purchaser_as_stated: "The Founder", business_purpose: "Retouching", incidental_personal_use: true, personal_use_note: "Occasional personal use", basis_statement: "Founder statement", review_status: "pending_professional_review", status: "current" });
    h.db.tables.entity_equipment_acquisitions[0].company_asset_id = A;
    const r = await loadAssetRegister("u");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ identifier: "SER-1", linkedAcquisitionId: "acq-q", ownership: { entityId: Q, incidentalPersonalUse: true, reviewStatus: "pending_professional_review" } });
    expect(h.db.writes).toEqual([]);
    h.superAdmin = false; expect(await loadAssetRegister("u")).toEqual([]);
  });
});
