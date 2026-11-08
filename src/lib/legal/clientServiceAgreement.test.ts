import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_SERVICE_MASTER_DRAFT, CLIENT_SERVICE_MASTER_VERSION, COUNSEL_SLOT, TOKEN } from "./clientServiceAgreementMaster";
import { composeClientServiceAgreementText, type ClientServiceSnapshot } from "./clientServiceAgreementDocument";
import { assessClientAgreementIssuance, clientAgreementIssuanceFlagOn, issueClientServiceAgreement } from "./clientServiceAgreementIssuance";

const FP = "a".repeat(64);
const snap = (o: Partial<ClientServiceSnapshot> = {}): ClientServiceSnapshot => ({
  agreementReference: "SYNTH-REF-1", jurisdiction: "Qatar", activities: ["videography"],
  contractingEntity: { id: "e1", name: "Entity A", legalName: "ENTITY A W.L.L.", registrationType: "W.L.L.", registrationNumber: "CR-1", businessAddress: "Street 1 || Doha" },
  signatory: { name: "Sara Signatory", position: "Manager", authority: "Board resolution on file" },
  client: { kind: "organisation", organisationName: "Client Co", representativeName: "Rami Rep", representativePosition: "Marketing Director", email: "rep@client.test", address: "Dubai" },
  quotation: { reference: "ORD-QUO-2026-000001", fingerprint: FP, currency: "QAR", total: 4200, payment: { condition: "deposit", depositPercent: 50 }, paymentTermsText: "A 50% deposit is required to confirm the booking.\n\nBalance due on delivery.",
    lines: [{ serviceItem: "Corporate film", description: "2-minute brand film", quantity: 1, unitBasis: "package" }, { serviceItem: "Drone footage", description: null, quantity: 2, unitBasis: "hour" }] },
  schedule: [{ startsAt: "2026-12-01T06:00:00.000Z", endsAt: "2026-12-01T10:00:00.000Z", timezone: "Asia/Qatar", kind: "on_site", location: "Doha studio" }, { startsAt: "2026-12-02T10:00:00.000Z", endsAt: "2026-12-02T11:00:00.000Z", timezone: "Asia/Qatar", kind: "online", platform: "Zoom" }],
  ...o,
});
// a master with EVERY counsel slot removed: stands in for a future counsel-approved master (test fixture only; it is not a legal text)
const reviewed = CLIENT_SERVICE_MASTER_DRAFT.replace(COUNSEL_SLOT, "").replace(/\n{3,}/g, "\n\n");
const input = (o: Partial<Parameters<typeof composeClientServiceAgreementText>[0]> = {}) => ({ masterText: reviewed, masterVersion: "TEST-1.0", masterContentReference: "TEST-REF", masterDocumentHash: "b".repeat(64), snapshot: snap(), ...o });

describe("the draft master", () => {
  it("is version 0.1-DRAFT, has the fourteen proposed clauses, and every legal clause is a counsel slot", () => {
    expect(CLIENT_SERVICE_MASTER_VERSION).toBe("0.1-DRAFT");
    for (let n = 1; n <= 14; n++) expect(CLIENT_SERVICE_MASTER_DRAFT).toMatch(new RegExp(`^${n}\\. [A-Z]`, "m"));
    expect(CLIENT_SERVICE_MASTER_DRAFT.match(COUNSEL_SLOT)!.length).toBeGreaterThanOrEqual(13);
  });
  it("contains no legal wording of its own for the counsel clauses (headings and slots only)", () => {
    for (const n of [5, 6, 7, 8, 9, 10, 11, 12]) { const clause = new RegExp(`^${n}\\. [^\\n]+\\n([\\s\\S]*?)(?=\\n\\d+\\. |$)`, "m").exec(CLIENT_SERVICE_MASTER_DRAFT)![1].trim(); expect(clause, `clause ${n}`).toMatch(/^\[\[COUNSEL:[^\]]*\]\]$/); }
  });
  it("uses only tokens the composer fills", () => {
    const out = composeClientServiceAgreementText(input());
    expect(out.ok).toBe(true);
    for (const m of CLIENT_SERVICE_MASTER_DRAFT.matchAll(TOKEN)) expect(typeof m[1]).toBe("string");
  });
});

describe("composition REFUSES while counsel's wording is outstanding", () => {
  it("the draft master can never be composed, however complete the particulars are", () => {
    const r = composeClientServiceAgreementText(input({ masterText: CLIENT_SERVICE_MASTER_DRAFT }));
    expect(r.ok).toBe(false); if (!r.ok) { expect(r.missing.join(" ")).toMatch(/awaiting counsel's wording/); expect(r.counselSlots).toBeGreaterThan(10); }
  });
  it("a single remaining slot is enough to refuse", () => { const r = composeClientServiceAgreementText(input({ masterText: `${reviewed}\n[[COUNSEL: one clause left]]` })); expect(r.ok).toBe(false); });
});

describe("composition from a counsel-free master (fixture)", () => {
  it("fills the operational clauses from the recorded facts, exactly as recorded", () => {
    const r = composeClientServiceAgreementText(input()); expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.text).toContain("AGREEMENT REFERENCE: SYNTH-REF-1");
    expect(r.text).toContain("Entity A, legal name ENTITY A W.L.L., W.L.L., registration number CR-1; business address: Street 1, Doha");
    expect(r.text).toContain("Client Co, acting through Rami Rep, Marketing Director; address: Dubai; email: rep@client.test");
    expect(r.text).toContain(`ORD-QUO-2026-000001 (content fingerprint ${FP})`);
    expect(r.text).toContain("  1. Corporate film - 2-minute brand film (1 x package)"); expect(r.text).toContain("  2. Drone footage (2 x hour)");
    expect(r.text).toContain("Price: QAR 4200.00"); expect(r.text).toContain("A 50% deposit is required to confirm the booking.");
    expect(r.text).toContain("Session 1: 1 December 2026, 09:00-13:00 (Asia/Qatar), on site (Doha studio)"); expect(r.text).toContain("Session 2: 2 December 2026, 13:00-14:00 (Asia/Qatar), online (Zoom)");
    expect(r.text).not.toMatch(TOKEN); expect(r.text).not.toMatch(COUNSEL_SLOT);
  });
  it("is deterministic: the same inputs give the same text and SHA-256", () => { const a = composeClientServiceAgreementText(input()), b = composeClientServiceAgreementText(input()); expect(a).toEqual(b); if (a.ok) expect(a.sha256).toMatch(/^[0-9a-f]{64}$/); });
  it("an individual client signs personally", () => {
    const r = composeClientServiceAgreementText(input({ snapshot: snap({ client: { kind: "individual", legalName: "Dana Client", email: "d@client.test" } }) }));
    expect(r.ok).toBe(true); if (r.ok) { expect(r.text).toContain("Dana Client, contracting personally; email: d@client.test"); expect(r.text).toContain("For the client: Dana Client"); }
  });
  it("refuses, naming each gap, when a particular is missing: nothing is guessed", () => {
    const bare = snap({ jurisdiction: null, contractingEntity: { id: "e1", name: "Entity A", legalName: null, registrationType: null, registrationNumber: null, businessAddress: null }, signatory: { name: "", position: "", authority: null },
      client: { kind: "organisation", organisationName: "Client Co", email: null }, quotation: { ...snap().quotation, fingerprint: null, lines: [] }, activities: [], schedule: [] });
    const r = composeClientServiceAgreementText(input({ snapshot: bare, masterContentReference: null }));
    expect(r.ok).toBe(false); if (!r.ok) for (const need of [/Jurisdiction/, /registration number/, /business address/, /Authorised signatory/, /representative/, /Client email/, /fingerprint/, /service lines/, /Activities declared/, /Controlled master reference/, /Confirmed schedule/]) expect(r.missing.join("|")).toMatch(need);
  });
  it("refuses when the quotation's structured condition and written terms disagree (the booking gate would refuse it too)", () => {
    const bad = snap({ quotation: { ...snap().quotation, paymentTermsText: "Full payment is required in advance." } });
    const r = composeClientServiceAgreementText(input({ snapshot: bad })); expect(r.ok).toBe(false); if (!r.ok) expect(r.missing.join(" ")).toMatch(/structured payment condition and its written terms must agree/);
  });
  it("refuses an unknown token in the master instead of printing it", () => { const r = composeClientServiceAgreementText(input({ masterText: `${reviewed}\n{{SURPRISE}}` })); expect(r.ok).toBe(false); if (!r.ok) expect(r.missing.join(" ")).toMatch(/SURPRISE/); });
  it("refuses a schedule-less document: the booking must be confirmed first", () => { const r = composeClientServiceAgreementText(input({ snapshot: snap({ schedule: undefined }) })); expect(r.ok).toBe(false); });
});

describe("issuance is disabled", () => {
  const all = { flagOn: true, actorIsSuperAdmin: true, quotationAccepted: true, bookingConfirmed: true, entityEligible: true, canonicalCodeAllocated: true, compositionOk: true, master: { status: "active", counselApprovalRecorded: true, activated: true, counselSlotsRemaining: 0 } };
  it("the flag defaults off and reads only 'true'", () => { expect(clientAgreementIssuanceFlagOn({})).toBe(false); expect(clientAgreementIssuanceFlagOn({ CLIENT_SERVICE_AGREEMENT_ISSUANCE_ENABLED: "1" })).toBe(false); expect(clientAgreementIssuanceFlagOn({ CLIENT_SERVICE_AGREEMENT_ISSUANCE_ENABLED: "true" })).toBe(true); });
  it("with the draft master and nothing recorded, every blocker is reported", () => {
    const b = assessClientAgreementIssuance({ flagOn: false, actorIsSuperAdmin: false, quotationAccepted: false, bookingConfirmed: false, entityEligible: false, canonicalCodeAllocated: false, compositionOk: false, master: { status: "draft", counselApprovalRecorded: false, activated: false, counselSlotsRemaining: 13 } }).join(" | ");
    for (const need of [/not switched on/, /Super Admin/, /not been allocated/, /awaiting counsel/, /written approval/, /not active/, /accept an issued/, /not eligible/, /booking must be confirmed/, /cannot be composed/]) expect(b).toMatch(need);
  });
  it("an unregistered master blocks", () => { expect(assessClientAgreementIssuance({ ...all, master: null })).toContain("The Client Services Agreement master is not registered."); });
  it("with every blocker cleared the assessment is empty, yet the issue function STILL refuses (the sending step is not built)", async () => {
    expect(assessClientAgreementIssuance(all)).toEqual([]);
    expect(await issueClientServiceAgreement()).toEqual({ ok: false, error: expect.stringMatching(/disabled in this build/) });
  });
});

describe("static: inert and separate", () => {
  const root = process.cwd();
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (["node_modules", ".next", ".git"].includes(f) ? [] : walk(p)) : [p]; });
  const files = walk(join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => relative(root, f));
  it("nothing outside these files imports the client agreement modules (no screen, route or action uses them yet)", () => {
    const importers = files.filter((f) => !/clientServiceAgreement/.test(f)).filter((f) => /clientServiceAgreement(Master|Document|Issuance)/.test(readFileSync(join(root, f), "utf8")));
    expect(importers).toEqual([]);
  });
  it("the modules touch no database, email, storage or signature engine, and share nothing with the instructor/employment/vendor composers", () => {
    for (const f of ["Master", "Document", "Issuance"]) {
      const code = readFileSync(join(root, `src/lib/legal/clientServiceAgreement${f}.ts`), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      expect(code, f).not.toMatch(/supabase|createAdminClient|sendEmail|signatureEngine|agreementEngine|instructorAgreement|employeeAgreement|vendorAgreement|\.from\(/);
    }
  });
});
