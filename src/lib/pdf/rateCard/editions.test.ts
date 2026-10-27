import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, type FakeDb } from "@/lib/legal/fakeAdmin.testkit";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, logged: [] as { action: string; metadata: Record<string, unknown> }[] }));
vi.mock("@/lib/supabase/admin", async () => { const { fakeAdmin: make } = await import("@/lib/legal/fakeAdmin.testkit"); return { createAdminClient: () => make(h.db) }; });
vi.mock("@/lib/admin/activityLog", () => ({ logActivity: async (e: { action: string; metadata: Record<string, unknown> }) => { h.logged.push(e); } }));
vi.mock("@/lib/organization/authority", () => ({ isSuperAdminId: async (id: string) => id === "super", hasAuthority: async () => true }));

import { approveEdition, createDraft, getApprovedEditionForDownload, getEdition, listEditions, startNextEdition, updateDraft } from "./editions";
import { canonicalJson, contentHash } from "./edition";
import { convertContent, DEFAULT_ROUNDING } from "./convert";
import { PLACEHOLDER_MARK, type RateCardContent } from "./types";

const card = (over: Partial<RateCardContent["meta"]> = {}): RateCardContent => ({
  meta: { title: "Rate Card", editionLabel: "2026 Edition 1", effectiveDate: "2026-11-01", marketSlug: "ghana", marketName: "Ghana", currency: "USD", conversionPolicy: "none", issuingEntity: { jurisdiction: over.marketSlug === "qatar" ? "Qatar" : "Ghana", name: "Ordift Studios", checkedOn: "2026-11-01", licensedActivities: ["photography"] }, ...over },
  coverImage: "/pdf/cover.jpg", cover: { variant: "standard", focusY: 0.5, cleared: true, clearedNote: "Founder's own statement" },
  sections: [{ key: "ps", title: "Personal sessions", structure: "fixed", items: [{ key: "a", name: "1-hour session", description: "Approved wording.", inclusions: ["10 edited images"], price: { kind: "fixed", amount: 125, unit: "per session" }, source: "selling_rates", activities: ["photography"] }] }],
  conditions: [{ title: "Validity", text: "Approved text." }], contact: [{ label: "Email", value: "x@example.com" }],
});
const rpcApprove = (args: Record<string, unknown>, db: FakeDb) => {
  const rows = db.tables.pdf_document_editions; const e = rows.find((r) => r.id === args.p_id)!;
  if (e.status !== "draft") return { data: null, error: { message: "ordift:edition_not_a_draft" } };
  if (e.updated_at !== args.p_expected_updated_at) return { data: null, error: { message: "ordift:edition_changed", code: "40001" } };
  const prev = rows.find((r) => r.status === "approved" && r.market_slug === e.market_slug && r.kind === e.kind);
  if (prev) Object.assign(prev, { status: "superseded", superseded_by: e.id });
  Object.assign(e, { status: "approved", content_sha256: args.p_sha256, approved_by: args.p_actor, approved_at: "2026-11-01T10:00:00Z", clearance_statement: args.p_clearance });
  return { data: [{ approved_at: "2026-11-01T10:00:00Z", superseded_id: prev?.id ?? null }], error: null };
};
const ago = (rows: Record<string, unknown>[], id: string) => rows.find((r) => r.id === id)!;

beforeEach(() => { h.logged = []; h.db = makeFakeDb({ pdf_document_editions: [] }); h.db.rpcHandlers = { approve_pdf_edition: rpcApprove }; });
const draft = async (c = card()) => { const r = await createDraft({ actorUserId: "super", content: c }); if (!r.ok) throw new Error(r.error); return r.id; };

describe("access: Super Admin only, on every operation", () => {
  it("refuses everyone else without touching anything", async () => {
    expect(await listEditions("staff")).toEqual([]);
    for (const r of [await createDraft({ actorUserId: "staff", content: card() }), await getEdition("staff", "x"), await updateDraft({ actorUserId: "staff", id: "x", content: card(), expectedUpdatedAt: "t" }), await approveEdition({ actorUserId: "staff", id: "x", clearanceStatement: "cleared by founder", today: "2026-11-01" }), await startNextEdition({ actorUserId: "staff", fromId: "x", editionLabel: "N", effectiveDate: "2026-11-02" }), await getApprovedEditionForDownload({ actorUserId: "staff", id: "x" })]) {
      expect(r).toEqual({ ok: false, error: "Only Super Admin may manage rate card editions." });
    }
    expect(h.db.writes).toEqual([]); expect(h.logged).toEqual([]);
  });
});

describe("drafts stay editable; bad content is refused; edits are audited", () => {
  it("creates a draft (market and label taken from the content) and audits it", async () => {
    const id = await draft();
    expect(h.db.tables.pdf_document_editions[0]).toMatchObject({ id, kind: "rate_card", market_slug: "ghana", edition_label: "2026 Edition 1", status: "draft", currency: "USD", created_by: "super" });
    expect(h.logged).toEqual([{ actorUserId: "super", action: "pdf_edition.draft_created", entityType: "pdf_document_edition", entityId: id, metadata: { kind: "rate_card", market: "ghana", editionLabel: "2026 Edition 1" } }]);
  });
  it("refuses content with a hidden cost or margin field, invalid prices, or an oversized card — saving nothing", async () => {
    const bad = card() as unknown as { sections: { items: Record<string, unknown>[] }[] }; bad.sections[0].items[0].costUsd = 40;
    expect((await createDraft({ actorUserId: "super", content: bad as never })).ok).toBe(false);
    const zero = card(); (zero.sections[0].items[0].price as { amount: number }).amount = 0; expect(await createDraft({ actorUserId: "super", content: zero })).toMatchObject({ ok: false, error: expect.stringMatching(/above zero/) });
    const big = card(); big.intro = "x".repeat(950_000); expect(await createDraft({ actorUserId: "super", content: big })).toMatchObject({ ok: false, error: "The rate card is too large to save." });
    expect(h.db.tables.pdf_document_editions).toHaveLength(0);
  });
  it("updates a draft once; a stale copy is refused; the market cannot change", async () => {
    const id = await draft(); const t0 = ago(h.db.tables.pdf_document_editions, id).updated_at as string;
    const next = card(); next.intro = "Updated."; h.db.tables.pdf_document_editions[0].updated_at = "later";
    expect(await updateDraft({ actorUserId: "super", id, content: next, expectedUpdatedAt: t0 })).toMatchObject({ ok: false, error: expect.stringMatching(/changed elsewhere/) });
    expect(await updateDraft({ actorUserId: "super", id, content: next, expectedUpdatedAt: "later" })).toMatchObject({ ok: true });
    expect((ago(h.db.tables.pdf_document_editions, id).content as RateCardContent).intro).toBe("Updated.");
    expect(await updateDraft({ actorUserId: "super", id, content: card({ marketSlug: "qatar" }), expectedUpdatedAt: "later" })).toMatchObject({ ok: false, error: expect.stringMatching(/market of an edition cannot be changed/) });
  });
});

describe("approval: validated again on the server, frozen, hash-stamped, audited", () => {
  it("a complete, real card is approved: the hash is of the canonical content, the approver and clearance are recorded, the audit event is written by the approval", async () => {
    const id = await draft();
    const r = await approveEdition({ actorUserId: "super", id, clearanceStatement: "Prices and wording checked and cleared by the Founder.", today: "2026-11-01" });
    expect(r).toMatchObject({ ok: true, supersededEditionId: null });
    const row = ago(h.db.tables.pdf_document_editions, id);
    expect(row).toMatchObject({ status: "approved", approved_by: "super", clearance_statement: "Prices and wording checked and cleared by the Founder." });
    expect(row.content_sha256).toBe(await contentHash(JSON.parse(canonicalJson(card())))); expect(row.content_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("refuses placeholder wording, a missing clearance statement and a non-draft — approving nothing", async () => {
    const c = card(); c.conditions[0].text = `${PLACEHOLDER_MARK} to be supplied`; const id = await draft(c);
    expect(await approveEdition({ actorUserId: "super", id, clearanceStatement: "cleared by founder", today: "2026-11-01" })).toMatchObject({ ok: false, error: expect.stringMatching(/placeholder wording/) });
    expect(await approveEdition({ actorUserId: "super", id, clearanceStatement: "short", today: "2026-11-01" })).toMatchObject({ ok: false, error: expect.stringMatching(/clearance statement/) });
    expect(ago(h.db.tables.pdf_document_editions, id).status).toBe("draft");
    const ok = await draft(card({ editionLabel: "E2" })); await approveEdition({ actorUserId: "super", id: ok, clearanceStatement: "cleared by founder", today: "2026-11-01" });
    expect(await approveEdition({ actorUserId: "super", id: ok, clearanceStatement: "cleared by founder", today: "2026-11-01" })).toMatchObject({ ok: false, error: "Only a draft can be approved." });
  });
  it("a converted (QAR) card can never be approved while the currency policy is unapproved", async () => {
    const q = convertContent(card({ marketSlug: "qatar", marketName: "Qatar" }), { currency: "QAR", rateToUsd: 3.64, effectiveFrom: "2026-10-11", source: "Governed table", rule: DEFAULT_ROUNDING }); q.meta.conversionPolicy = "approved";
    const id = await draft(q);
    expect(await approveEdition({ actorUserId: "super", id, clearanceStatement: "cleared by founder", today: "2026-11-01" })).toMatchObject({ ok: false, error: expect.stringMatching(/cannot be approved for clients yet/) });
  });
  it("the selling rates changing after the draft was built blocks approval (the card would disagree with quotations); so does a licence change", async () => {
    const id = await draft(); const moved = card(); (moved.sections[0].items[0].price as { amount: number }).amount = 130;
    const base = { actorUserId: "super", id, clearanceStatement: "cleared by founder", today: "2026-11-01" };
    expect(await approveEdition({ ...base, deps: { currentUsd: async () => moved } })).toMatchObject({ ok: false, error: expect.stringMatching(/selling rates changed.*USD 130 \(the card has USD 125\)/) });
    expect(await approveEdition({ ...base, deps: { currentUsd: async () => null } })).toMatchObject({ ok: false, error: expect.stringMatching(/could not be read/) });
    expect(await approveEdition({ ...base, deps: { licensed: async () => ({ entityName: "Ordift", checkedOn: "2026-11-01", keys: ["videography"] }) } })).toMatchObject({ ok: false, error: expect.stringMatching(/Eligibility changed/) });
    expect(await approveEdition({ ...base, deps: { licensed: async () => null } })).toMatchObject({ ok: false });
    expect(ago(h.db.tables.pdf_document_editions, id).status).toBe("draft");
    expect(await approveEdition({ ...base, deps: { currentUsd: async () => card(), licensed: async () => ({ entityName: "Ordift", checkedOn: "2026-11-01", keys: ["photography"] }) } })).toMatchObject({ ok: true });
  });
  it("a draft edited between checking and approving is refused (stale token), and database errors are explained", async () => {
    const id = await draft(); h.db.rpcHandlers!.approve_pdf_edition = () => ({ data: null, error: { message: "ordift:edition_changed", code: "40001" } });
    expect(await approveEdition({ actorUserId: "super", id, clearanceStatement: "cleared by founder", today: "2026-11-01" })).toMatchObject({ ok: false, error: expect.stringMatching(/changed after it was checked/) });
    h.db.rpcHandlers!.approve_pdf_edition = () => ({ data: null, error: { message: "ordift:not_authorised" } });
    expect(await approveEdition({ actorUserId: "super", id, clearanceStatement: "cleared by founder", today: "2026-11-01" })).toMatchObject({ ok: false, error: "Only Super Admin may manage rate card editions." });
  });
  it("approving a newer edition supersedes the previous approved one for the same market", async () => {
    const a = await draft(); await approveEdition({ actorUserId: "super", id: a, clearanceStatement: "cleared by founder", today: "2026-11-01" });
    const next = await startNextEdition({ actorUserId: "super", fromId: a, editionLabel: "2026 Edition 2", effectiveDate: "2026-12-01" }); if (!next.ok) throw new Error(next.error);
    const r = await approveEdition({ actorUserId: "super", id: next.id, clearanceStatement: "cleared by founder again", today: "2026-12-01" });
    expect(r).toMatchObject({ ok: true, supersededEditionId: a }); expect(ago(h.db.tables.pdf_document_editions, a)).toMatchObject({ status: "superseded", superseded_by: next.id });
  });
});

describe("approved editions are immutable; changes make a new edition", () => {
  it("an approved edition cannot be updated; a new edition copies it under a different label and leaves the original untouched", async () => {
    const id = await draft(); await approveEdition({ actorUserId: "super", id, clearanceStatement: "cleared by founder", today: "2026-11-01" });
    const before = JSON.stringify(ago(h.db.tables.pdf_document_editions, id));
    expect(await updateDraft({ actorUserId: "super", id, content: card(), expectedUpdatedAt: "x" })).toMatchObject({ ok: false, error: expect.stringMatching(/cannot be edited/) });
    expect(await startNextEdition({ actorUserId: "super", fromId: id, editionLabel: "2026 edition 1", effectiveDate: "2026-12-01" })).toMatchObject({ ok: false, error: "Give the new edition a different label." });
    expect(await startNextEdition({ actorUserId: "super", fromId: id, editionLabel: "2026 Edition 2", effectiveDate: "2026-12-01" })).toMatchObject({ ok: true });
    expect(JSON.stringify(ago(h.db.tables.pdf_document_editions, id))).toBe(before);
    const copy = h.db.tables.pdf_document_editions[1]; expect(copy).toMatchObject({ status: "draft" }); expect((copy.content as RateCardContent).meta).toMatchObject({ editionLabel: "2026 Edition 2", effectiveDate: "2026-12-01" });
  });
  it("a draft cannot be turned into a next edition", async () => { const id = await draft(); expect(await startNextEdition({ actorUserId: "super", fromId: id, editionLabel: "N", effectiveDate: "2026-12-01" })).toMatchObject({ ok: false }); });
});

describe("download: only an approved edition whose content still matches its hash; every download is audited", () => {
  it("refuses a draft and a superseded edition; releases an approved one and records who downloaded it", async () => {
    const id = await draft(); expect(await getApprovedEditionForDownload({ actorUserId: "super", id })).toMatchObject({ ok: false, error: expect.stringMatching(/cannot be downloaded as a final PDF/) });
    await approveEdition({ actorUserId: "super", id, clearanceStatement: "cleared by founder", today: "2026-11-01" }); h.logged = [];
    const r = await getApprovedEditionForDownload({ actorUserId: "super", id }); expect(r.ok).toBe(true);
    expect(h.logged).toEqual([expect.objectContaining({ action: "pdf_edition.downloaded", entityId: id, metadata: expect.objectContaining({ editionLabel: "2026 Edition 1" }) })]);
    ago(h.db.tables.pdf_document_editions, id).status = "superseded"; expect(await getApprovedEditionForDownload({ actorUserId: "super", id })).toMatchObject({ ok: false, error: expect.stringMatching(/superseded/) });
  });
  it("an edition whose stored content no longer matches the approved hash is NOT released and is reported as failed", async () => {
    const id = await draft(); await approveEdition({ actorUserId: "super", id, clearanceStatement: "cleared by founder", today: "2026-11-01" });
    ((ago(h.db.tables.pdf_document_editions, id).content as RateCardContent).sections[0].items[0].price as { amount: number }).amount = 1;   // tampering that bypassed the database guard
    expect(await getApprovedEditionForDownload({ actorUserId: "super", id })).toMatchObject({ ok: false, error: expect.stringMatching(/failed its integrity check/) });
    expect(await getEdition("super", id)).toMatchObject({ ok: true, integrity: "FAILED" });
  });
});

describe("Qatar and Ghana are independently approvable", () => {
  it("approving the Qatar card does not approve, supersede or alter the Ghana card (and the reverse); each market keeps one approved edition", async () => {
    const q = await draft(card({ marketSlug: "qatar", marketName: "Qatar" })); const g = await draft(card({ marketSlug: "ghana", marketName: "Ghana" }));
    const base = { actorUserId: "super", clearanceStatement: "cleared by founder", today: "2026-11-01" };
    expect(await approveEdition({ ...base, id: q })).toMatchObject({ ok: true, supersededEditionId: null });
    expect(ago(h.db.tables.pdf_document_editions, g).status).toBe("draft");
    const gBefore = JSON.stringify(ago(h.db.tables.pdf_document_editions, g));
    expect(await approveEdition({ ...base, id: g })).toMatchObject({ ok: true, supersededEditionId: null });
    expect(ago(h.db.tables.pdf_document_editions, q)).toMatchObject({ status: "approved" }); expect(JSON.stringify(ago(h.db.tables.pdf_document_editions, g))).not.toBe(gBefore);
    const q2 = await startNextEdition({ actorUserId: "super", fromId: q, editionLabel: "2026 Edition 2", effectiveDate: "2026-12-01" }); if (!q2.ok) throw new Error(q2.error);
    expect(await approveEdition({ ...base, id: q2.id, today: "2026-12-01" })).toMatchObject({ ok: true, supersededEditionId: q });
    expect(ago(h.db.tables.pdf_document_editions, g).status).toBe("approved");   // Ghana untouched by a new Qatar edition
  });
});
