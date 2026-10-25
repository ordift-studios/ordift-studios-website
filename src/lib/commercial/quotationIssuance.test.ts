import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../app/admin/pricing/quotations/actions", () => ({ issueQuotationAction: vi.fn(), recordQuotationAcceptanceAction: vi.fn(), recordQuotationDeliveryAction: vi.fn(), updateQuotationStatusAction: vi.fn() }));
vi.mock("@/components/admin/LocalDateTimeField", () => ({ default: ({ name }: { name: string }) => createElement("input", { name, type: "datetime-local" }) }));

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
const issuance = code(read("./quotationIssuance.ts"));
const quotations = code(read("./clientQuotations.ts"));
const acceptance = code(read("./quotationAcceptance.ts"));

describe("issuing is a recorded, confirmed act: never a bare status flip, never sending, never money", () => {
  it("'sent' can no longer be set as a bare status change: it delegates to issuance", () => {
    const i = quotations.indexOf("export async function updateQuotationStatus");
    const body = quotations.slice(i, quotations.indexOf("export async function associateProspectQuotationWithClient"));
    expect(body).toMatch(/params\.status === "sent"[\s\S]*issueOrdinaryQuotation\(\{ quotationId: params\.quotationId \}\)/);
    expect(body.indexOf("issueOrdinaryQuotation")).toBeLessThan(body.indexOf('.update({ status: params.status })'));
  });
  it("one conditional write (inside the atomic function) records status, issue time, issuer and validity together, and only for a still-draft, never-issued row", () => {
    const sql = read("../../../supabase/migrations/0172_atomic_ordinary_quotation_issuance.sql");
    expect(sql).toContain("set status = 'sent', issued_at = v_issued, issued_by = p_actor, valid_until = p_valid_until");
    expect(sql).toMatch(/if q\.status <> 'draft' or q\.issued_at is not null then raise exception 'ordift:already_issued'/);
  });
  it("the contracting entity is resolved from the authoritative record INSIDE the issuing transaction; it is never defaulted or inferred", () => {
    const sql = read("../../../supabase/migrations/0172_atomic_ordinary_quotation_issuance.sql");
    const fn = sql.slice(sql.indexOf("create or replace function public.issue_ordinary_quotation"), sql.indexOf("revoke all on function public.issue_ordinary_quotation"));
    expect(fn).toMatch(/from public\.booking_contracting_entities b[\s\S]*subject_type = 'quotation'[\s\S]*subject_type = 'enquiry'[\s\S]*if v_entity is null then raise exception 'ordift:entity_required'/);
    expect(fn).not.toMatch(/insert into public\.booking_contracting_entities|employing_entities where slug|default.*entity/i);
    const resolver = code(read("./quotationEntity.ts"));
    expect(resolver).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|chooseContractingEntity|default\w*Entity|slug/i);
  });
  it("it audits who, when, the approved validity, any exception and its approver, the entity and its frozen details, and states that nothing was sent", () => {
    for (const t of ["standardValidUntil", "withinStandardPolicy", "exceptionReason", "approvedBy: user.id", "not sent by the system"]) expect(issuance).toContain(t);
    const sql = read("../../../supabase/migrations/0172_atomic_ordinary_quotation_issuance.sql");
    for (const t of ["'issuedAt'", "'validUntil'", "'contractingEntity'", "'legalDetails'", "actor_user_id", "'client_quotation.issued'"]) expect(sql).toContain(t);
  });
  it("the issuance event keeps its documented action name", () => {
    expect(code(read("./quotationIssuedDetails.ts"))).toContain('ISSUED_ACTION = "client_quotation.issued"');
  });
  it("it sends nothing and creates nothing financial: no email, notification, payment, booking, amount due or acceptance", () => {
    expect(issuance).not.toMatch(/sendEmail\(|sendQuotation|dispatch\w*\(|resend|\.from\("(payments|payment_obligations|engagements|enquiries)"\)|amount_due|accepted_at|accepted_via|crm_stage|establish_enquiry_amount_due/i);
    for (const imp of [...read("./quotationIssuance.ts").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1])) expect(imp).not.toMatch(/email|notification|payments|crewSupport/i);
  });
  it("only an admin or Super Admin; Crew Support quotations are refused", () => {
    expect(issuance).toMatch(/hasRole\(user, "admin"\) && !isSuperAdmin\(user\)/);
    expect(issuance).toContain("crewManaged: Boolean(q.crew_support_request_id)");
  });
  it("delivery is a person's record (an audit event): it changes nothing on the quotation and is refused before issue", () => {
    const d = issuance.slice(issuance.indexOf("export async function recordQuotationDelivery"));
    expect(d).not.toMatch(/\.update\(/);
    expect(d).toContain('q.status !== "sent" && q.status !== "accepted"');
    expect(d).toContain("the system did not send anything");
  });
});

describe("expiry is enforced for staff-recorded acceptance and the client-portal acceptance", () => {
  it("staff acceptance refuses an acceptance received after the validity date", () => {
    expect(acceptance).toMatch(/acceptanceExpiryRefusal\(q\.valid_until, checked\.receivedAtIso\)/);
    expect(acceptance.indexOf("acceptanceExpiryRefusal(")).toBeLessThan(acceptance.indexOf('.update({'));
  });
  it("the only client-portal acceptance path (Crew Support quotations) already checks the validity date at the moment of acceptance", () => {
    const c = code(read("../crewSupport/quotation.ts"));
    const i = c.indexOf("export async function acceptQuotationAsClient");
    expect(c.slice(i, i + 900)).toMatch(/validateAcceptance\(\{ status: quote\.status, validUntil: quote\.validUntil/);
    expect(c).toMatch(/\.not\("crew_support_request_id", "is", null\)\.in\("status", \["sent", "accepted"\]\)/);   // ordinary quotations have no client-portal acceptance
  });
  it("a revision stays ONE atomic database call; its carried date is handled at issuance, never silently kept", () => {
    const i = quotations.indexOf("export async function reviseClientQuotation");
    const body = quotations.slice(i, quotations.indexOf("export async function attachQuotationToEnquiry"));
    expect(body).toMatch(/rpc\("revise_ordinary_quotation"/);
    expect(body).not.toMatch(/\.(insert|update|delete)\(/);
  });
});

const baseProps = { quotationId: "q1", hasClient: false, today: "2026-10-26", defaultValidUntil: "2026-11-25", currentValidUntil: null as string | null, isSuperAdmin: false, blockers: [] as string[], expired: false, deliveredText: null as string | null };
async function render(over: Partial<typeof baseProps> & { status: string }) {
  const { QuotationStatusActions } = await import("../../app/admin/pricing/quotations/[id]/QuotationStatusActions");
  return renderToStaticMarkup(createElement(QuotationStatusActions, { ...baseProps, ...over }));
}

describe("the issuance panel (server-rendered markup)", () => {
  it("a draft: 'Issue quotation' with a required confirmation, the standard validity and a clear no-email statement; no 'Mark Sent'", async () => {
    const html = await render({ status: "draft" });
    expect(html).toContain("Issue quotation");
    expect(html).not.toContain("Mark Sent");
    expect(html).toContain("Draft (not issued)");
    expect(html).toContain("It does not email or notify the client");
    expect(html).toMatch(/name="confirm"[^>]*required|required[^>]*name="confirm"/);
    expect(html).toContain('value="2026-11-25"');
    expect(html).toContain("standard: 30 calendar days from issue = 25 Nov 2026");
    expect(html).not.toContain("exceptionReason");                    // no exception field while the date is the standard one
    expect(html).toContain("min-h-11");
  });
  it("an exception date shows the reason field; beyond 30 days it explains who may approve", async () => {
    const admin = await render({ status: "draft", currentValidUntil: "2026-12-31" });
    expect(admin).toContain("exceptionReason");
    expect(admin).toMatch(/Only a Founder \/ Super Admin can approve it/);
    const sa = await render({ status: "draft", currentValidUntil: "2026-12-31", isSuperAdmin: true });
    expect(sa).toMatch(/As a Super Admin you may approve it; the reason is recorded/);
    const shorter = await render({ status: "draft", currentValidUntil: "2026-11-10" });
    expect(shorter).toMatch(/A different validity period is an exception/);
  });
  it("a date that has already passed is not offered: the default is pre-filled instead", async () => {
    expect(await render({ status: "draft", currentValidUntil: "2026-10-12" })).toContain('value="2026-11-25"');
  });
  it("prerequisite blockers are shown", async () => {
    expect(await render({ status: "draft", blockers: ["Add at least one line item before issuing."] })).toContain("Add at least one line item before issuing.");
  });
  it("while the contracting entity is missing the Issue form is not offered at all, only the reason", async () => {
    const html = await render({ status: "draft", blockers: ["A contracting entity must be selected before this quotation can be issued."] });
    expect(html).toContain("Issuing is not available yet");
    expect(html).toContain("A contracting entity must be selected");
    expect(html).not.toContain('name="confirm"');
    expect(html).not.toContain("Issue this quotation");
  });
  it("the Issue form asks which activities the quotation covers: pre-ticks only the enquiry's suggestion, and says a planned activity is never treated as licensed", async () => {
    const opts = [{ key: "photography", label: "Photography" }, { key: "videography", label: "Videography" }, { key: "drone_operations", label: "Drone operations" }];
    const html = await render({ status: "draft", activityOptions: opts, defaultActivities: ["photography"] } as never);
    expect((html.match(/name="activities"/g) ?? []).length).toBe(3);
    expect(html).toMatch(/value="photography"[^>]*checked|checked[^>]*value="photography"/);
    expect(html).not.toMatch(/value="videography"[^>]*checked|checked[^>]*value="videography"/);
    expect(html).toContain("a planned activity is never treated as licensed");
    expect(await render({ status: "draft" })).not.toContain('name="activities"');                     // no options (e.g. Crew / issued): nothing to ask
    expect(await render({ status: "draft", blockers: ["A contracting entity must be selected"] , activityOptions: opts } as never)).not.toContain('name="activities"');   // blocked: no form at all
  });
  it("a Crew Support quotation shows no Issue form here: it is issued from its request", async () => {
    const html = await render({ status: "draft", crewManaged: true } as never);
    expect(html).not.toContain("Issue quotation");
    expect(html).not.toContain('name="confirm"');
    expect(html).toContain("issued from its Crew Support request");
    const sent = await render({ status: "sent", crewManaged: true } as never);
    expect(sent).not.toContain("Delivery to the client");
    expect(sent).not.toContain("Record acceptance (with evidence)");
  });
  it("an issued quotation: delivery is a separate recorded step, acceptance is available, no issue button", async () => {
    const html = await render({ status: "sent", currentValidUntil: "2026-11-25" });
    expect(html).not.toContain("Issue quotation");
    expect(html).toContain("Delivery to the client");
    expect(html).toContain("Issuing did not email or notify the client");
    expect(html).toContain("Record that I delivered it");
    expect(html).toContain("Record acceptance (with evidence)");
    expect(html).toContain("An acceptance received after the validity date cannot be recorded");
  });
  it("an expired quotation: no acceptance form, a clear reason and the way forward", async () => {
    const html = await render({ status: "sent", expired: true, currentValidUntil: "2026-10-20" });
    expect(html).not.toContain("Record acceptance (with evidence)");
    expect(html).toMatch(/expired, so acceptance cannot be recorded.*Revise/);
  });
  it("a recorded delivery is shown as recorded by staff", async () => {
    expect(await render({ status: "sent", deliveredText: "Delivered via WhatsApp message on 26 Oct 2026 (recorded by staff; the system sent nothing)" })).toContain("Delivered via WhatsApp message on 26 Oct 2026");
  });
});

describe("the dates card", () => {
  const card = async (o: { issuedAt: string | null; validUntil: string | null; status: string; today?: string }) => {
    const { default: Card } = await import("../../app/admin/pricing/quotations/[id]/QuotationDatesCard");
    return renderToStaticMarkup(createElement(Card, { createdAt: "2026-10-25T09:57:14Z", deliveryText: "d", acceptanceText: "a", today: "2026-10-26", ...o }));
  };
  it("a draft: prominent DRAFT indicator, Created date, 'Not yet issued', validity set at issue", async () => {
    const html = await card({ issuedAt: null, validUntil: null, status: "draft" });
    expect(html).toContain("Draft — not yet issued");
    expect(html).toContain("Created on");
    expect(html).toContain("25 Oct 2026");
    expect(html).toContain("Not yet issued");
    expect(html).toMatch(/Set when issued \(30 calendar days from the issue date\)/);
  });
  it("an issued quotation shows its real issue date and validity; an expired one is flagged", async () => {
    const ok = await card({ issuedAt: "2026-10-26T09:30:00Z", validUntil: "2026-11-25", status: "sent" });
    expect(ok).toContain("26 Oct 2026"); expect(ok).toContain("25 Nov 2026"); expect(ok).not.toContain("Draft — not yet issued"); expect(ok).not.toContain("Expired — cannot be accepted");
    const old = await card({ issuedAt: "2026-10-01T09:30:00Z", validUntil: "2026-10-20", status: "sent" });
    expect(old).toContain("Expired — cannot be accepted"); expect(old).toContain("(expired)");
  });
  it("a draft whose carried validity has passed says the old date will not carry over", async () => {
    expect(await card({ issuedAt: null, validUntil: "2026-10-12", status: "draft" })).toMatch(/12 Oct 2026, has passed and will not be carried over/);
  });
});

describe("the preview / PDF header", () => {
  async function renderPdf(view: unknown, q: { status: string; issuedAt: string | null; validUntil: string | null } = { status: "draft", issuedAt: null, validUntil: null }) {
    vi.resetModules();
    vi.doMock("@/lib/portal/roles", () => ({ getCurrentUser: async () => ({ id: "u", roles: ["admin"] }), hasRole: () => true, isSuperAdmin: () => false }));
    vi.doMock("@/lib/crewSupport/quotation", () => ({ getCrewQuotationPrintExtras: async () => null }));
    vi.doMock("@/lib/commercial/clientQuotations", () => ({ getClientQuotation: async () => ({ id: "q1", quotationReference: "ORD-QUO-2026-000006", status: q.status, createdAt: "2026-10-25T09:57:14Z", issuedAt: q.issuedAt, validUntil: q.validUntil, clientName: null, prospectName: "Test", prospectCompany: null, prospectEmail: null, prospectPhone: null, currency: "USD", subtotal: 351, discountTotal: 0, taxTotal: 0, total: 351, paymentBookingTerms: null, items: [] }) }));
    vi.doMock("@/lib/commercial/quotationEntity", () => ({ resolveQuotationEntityView: async () => view }));
    vi.doMock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); }, notFound: () => { throw new Error("notFound"); } }));
    const { default: Page } = await import("../../app/admin/pricing/quotations/[id]/pdf/page");
    return renderToStaticMarkup(await Page({ params: Promise.resolve({ id: "q1" }) }));
  }
  const NONE = { phase: "draft", resolution: { ok: false, code: "none", message: "A contracting entity must be selected before this quotation can be issued." } };
  it("labels Created / Issued / Valid until, and a draft says so loudly (never an unlabelled date)", async () => {
    const html = await renderPdf(NONE);
    expect(html).toContain("Created: 25 Oct 2026");
    expect(html).toContain("Issued: Not yet issued");
    expect(html).toMatch(/Valid until: Set when issued \(30 calendar days from the issue date\)/);
    expect(html).toContain("DRAFT — NOT YET ISSUED");
    expect(html).not.toMatch(/This quotation is valid until/);
  });
  it("a draft with no entity says it is not yet selected; nothing is guessed", async () => {
    const html = await renderPdf(NONE);
    expect(html).toMatch(/Contracting entity:.*not yet selected/);
  });
  it("with an entity it shows only the verified legal name, registration type and CR / tax identifiers", async () => {
    const html = await renderPdf({ phase: "draft", resolution: { ok: true, entity: { entityId: "e1", name: "Short Name", source: "quotation", version: 1, display: { legalName: "ORDIFT STUDIOS", registrationType: "W.L.L.", identifiers: [{ label: "Commercial Registration (CR) No.", identifier: "254551" }, { label: "Tax registration No.", identifier: "5009300880" }] } } } });
    expect(html).toContain("ORDIFT STUDIOS");
    expect(html).toContain("W.L.L.");
    expect(html).toContain("254551");
    expect(html).toContain("5009300880");
    expect(html).not.toMatch(/verification|basis|chosen|permit|establishment/i);
  });
  const FROZEN = { phase: "issued", frozen: { entityId: "e1", name: "Short Name", recordedOn: "quotation", version: 1, legalName: "ORDIFT STUDIOS (AS ISSUED)", registrationType: "W.L.L.", identifiers: [{ label: "Commercial Registration (CR) No.", identifier: "111111" }], capturedAt: "2026-10-26T08:00:00Z" }, record: { eventId: "ev1", recordedAt: "2026-10-26T08:00:01Z", issuedAt: "2026-10-26T08:00:00Z" } };
  it("an ISSUED quotation prints the legal details frozen at issuance; the live registry is not consulted", async () => {
    const html = await renderPdf(FROZEN, { status: "sent", issuedAt: "2026-10-26T08:00:00Z", validUntil: "2026-11-25" });
    expect(html).toContain("ORDIFT STUDIOS (AS ISSUED)");
    expect(html).toContain("111111");
    expect(html).not.toMatch(/not yet selected/);
  });
  it("an issued quotation from before the snapshot existed prints NO entity block (nothing is reconstructed or taken from the live registry)", async () => {
    const html = await renderPdf({ phase: "issued_unfrozen", live: { ok: true, entity: { entityId: "e9", name: "Live Later", source: "quotation", version: 1, display: { legalName: "LIVE LATER LEGAL NAME", registrationType: null, identifiers: [] } } } }, { status: "sent", issuedAt: "2026-10-26T08:00:00Z", validUntil: "2026-11-25" });
    expect(html).not.toContain("LIVE LATER LEGAL NAME");
    expect(html).not.toMatch(/Contracting entity/);
  });
});

import { parseIssuedLegalDetails, pickIssuanceEvent } from "./quotationIssuedDetails";

describe("the frozen legal details (pure parts)", () => {
  const d = { entityId: "e1", name: "Short", recordedOn: "enquiry", version: 2, legalName: "LEGAL NAME", registrationType: "W.L.L.", identifiers: [{ label: "Commercial Registration (CR) No.", identifier: "1" }], capturedAt: "2026-10-26T08:00:00.000000Z" };
  it("parsing returns exactly the frozen shape and rejects malformed or empty data", () => {
    expect(parseIssuedLegalDetails({ legalDetails: d })).toEqual(d);
    expect(parseIssuedLegalDetails({ legalDetails: { ...d, extra: "ignored", secret: "x" } })).toEqual(d);
    for (const bad of [null, {}, { legalDetails: null }, { legalDetails: { ...d, legalName: "  " } }, { legalDetails: { ...d, recordedOn: "agreement" } }, { legalDetails: { ...d, entityId: 5 } }]) expect(parseIssuedLegalDetails(bad)).toBeNull();
  });
  const ISSUED = "2026-10-26T08:00:00.123456+00:00";
  const mk = (over: Record<string, unknown> = {}) => ({ id: "ev", created_at: "2026-10-26T08:00:00.123456+00:00", actor_user_id: "u1", entity_type: "client_quotation", metadata: { issuedAt: "2026-10-26T08:00:00.123456Z", legalDetails: { legalName: "GENUINE" } }, ...over });
  it("the genuine event is found by exact issue time, creation time, issuer and type (microsecond text and ms ISO compare equal)", () => {
    expect(pickIssuanceEvent([mk()], ISSUED, "u1")?.id).toBe("ev");
  });
  it("FAIL-CLOSED: a backdated or later-dated copy, a wrong issuer, a wrong type, malformed metadata or no issuer is never selected", () => {
    for (const bad of [mk({ created_at: "2020-01-01T00:00:00Z" }), mk({ created_at: "2026-10-26T08:00:05Z" }), mk({ actor_user_id: "u2" }), mk({ entity_type: "enquiry" }), mk({ metadata: null }), mk({ metadata: { issuedAt: 42 } }), mk({ metadata: { issuedAt: "garbage" } })]) {
      expect(pickIssuanceEvent([bad], ISSUED, "u1")).toBeNull();
    }
    expect(pickIssuanceEvent([mk()], ISSUED, null)).toBeNull();
    expect(pickIssuanceEvent([mk()], "not a date", "u1")).toBeNull();
  });
  it("a forged event cannot displace the genuine one: ignored if it differs, and if it matches exactly (an ambiguous duplicate) NOTHING is shown rather than choosing either", () => {
    const forgedBackdated = mk({ id: "forged", created_at: "2020-01-01T00:00:00Z", metadata: { issuedAt: "2026-10-26T08:00:00.123456Z", legalDetails: { legalName: "FORGED" } } });
    expect(pickIssuanceEvent([forgedBackdated, mk()], ISSUED, "u1")?.id).toBe("ev");
    expect(pickIssuanceEvent([mk({ id: "forged" }), mk()], ISSUED, "u1")).toBeNull();
  });
});

describe("issued quotations are frozen (source guards)", () => {
  const strip = (t: string) => code(t);
  const issuanceSrc = strip(read("./quotationIssuance.ts"));
  it("issuing is ONE database call (the atomic function); the application writes neither the status, the audit event nor the snapshot itself", () => {
    const i = issuanceSrc.indexOf("export async function issueOrdinaryQuotation");
    const body = issuanceSrc.slice(i, issuanceSrc.indexOf("export const DELIVERY_CHANNELS"));
    expect(body).toContain('admin.rpc("issue_ordinary_quotation"');
    expect(body).not.toMatch(/\.update\(|\.insert\(|logActivity\(|status: "sent"/);
    expect(body).toMatch(/p_expected_entity: params\.expectedEntityId \?\? entity\.entity\.entityId/);
  });
  it("the migration does the whole job in one transaction: locks, entity check, frozen details, status, issuer, timestamp and audit event, executable by service_role only", () => {
    const sql = read("../../../supabase/migrations/0172_atomic_ordinary_quotation_issuance.sql");
    const fn = sql.slice(sql.indexOf("create or replace function public.issue_ordinary_quotation"), sql.indexOf("revoke all on function public.issue_ordinary_quotation"));
    expect(fn.indexOf("for update;                 -- enquiry first")).toBeGreaterThan(-1);
    for (const t of ["private.actor_has_role(p_actor", "for update;   -- then the quotation", "ordift:entity_required", "ordift:entity_ineligible", "private.entity_issue_standing(", "set status = 'sent', issued_at = v_issued, issued_by = p_actor", "'client_quotation.issued'", "'legalDetails'"]) expect(fn).toContain(t);
    expect(fn.indexOf("update public.client_quotations")).toBeLessThan(fn.indexOf("insert into public.activity_log"));
    expect(sql).toMatch(/revoke all on function public\.issue_ordinary_quotation\(uuid, uuid, date, uuid, jsonb\) from public, anon, authenticated;\s*grant execute on function public\.issue_ordinary_quotation\(uuid, uuid, date, uuid, jsonb\) to service_role;/);
    expect(fn).not.toMatch(/email|notification|payment|obligation|amount_due|accepted_at|crm_stage/i);
  });
  it("the migration protects the issuance event: three narrow triggers (only for that action), role + marker provenance, immutability, one per quotation, and nothing else on the audit log changes", () => {
    const sql = read("../../../supabase/migrations/0172_atomic_ordinary_quotation_issuance.sql");
    const fn = sql.slice(sql.indexOf("create or replace function private.activity_log_issuance_guard"), sql.indexOf("revoke all on function private.activity_log_issuance_guard"));
    expect(fn).toContain("security invoker");                                        // current_user must be the role actually running the insert
    expect(fn).toContain("current_user = v_owner");
    expect(fn).toContain("current_setting('ordift.issuing_quotation', true)");
    expect(sql).toMatch(/create trigger activity_log_issuance_guard_ins before insert on public\.activity_log\s+for each row when \(new\.action = 'client_quotation\.issued'\)/);
    expect(sql).toMatch(/create trigger activity_log_issuance_guard_upd before update on public\.activity_log\s+for each row when \(old\.action = 'client_quotation\.issued' or new\.action = 'client_quotation\.issued'\)/);
    expect(sql).toMatch(/create trigger activity_log_issuance_guard_del before delete on public\.activity_log\s+for each row when \(old\.action = 'client_quotation\.issued'\)/);
    expect(sql).toMatch(/create unique index activity_log_one_issuance_per_quotation on public\.activity_log \(entity_id\) where action = 'client_quotation\.issued'/);
    expect(sql).toMatch(/set_config\('ordift\.issuing_quotation', v_event::text \|\| ':' \|\| q\.id::text, true\)[\s\S]*insert into public\.activity_log \(id, actor_user_id, action, entity_type, entity_id, metadata, created_at\)[\s\S]*set_config\('ordift\.issuing_quotation', '', true\)/);
    const live = sql.replace(/--.*$/gm, "");                                         // statements only, not comments
    expect(live.match(/on public\.activity_log/g)?.length).toBe(4);                  // 3 triggers + 1 index: no policy, grant, revoke or column change on the audit log
    expect(live).not.toMatch(/(grant|revoke)[^;]*\bon (table )?public\.activity_log|alter table public\.activity_log|(create|alter|drop) policy/i);
  });
  it("the quotation PDF never reads the live entity for an issued quotation: it uses the view resolver only", () => {
    const pdf = strip(read("../../app/admin/pricing/quotations/[id]/pdf/page.tsx"));
    expect(pdf).toContain("resolveQuotationEntityView");
    expect(pdf).not.toMatch(/resolveQuotationEntity\(/);
    const page = strip(read("../../app/admin/pricing/quotations/[id]/page.tsx"));
    expect(page).not.toMatch(/resolveQuotationEntity\(/);
  });
  it("the entity lock is decided by the issuance timestamp (issued_at), never by the current status", () => {
    const reg = strip(read("../organization/entityRegistrations.ts"));
    const lock = reg.slice(reg.indexOf("async function issuedEntityLock"), reg.indexOf("export type ContractingSubject"));
    expect(lock).toContain("issued_at");
    expect(lock).not.toMatch(/\.eq\("status"/);
    expect(reg).not.toContain("hasIssuedOrdinaryQuotation");
  });
});

describe("migration 0173 replaces the issuing function WITHOUT weakening anything 0172 established", () => {
  const m72 = read("../../../supabase/migrations/0172_atomic_ordinary_quotation_issuance.sql");
  const m73 = read("../../../supabase/migrations/0173_jurisdiction_entity_requirements.sql");
  const fn = (sql: string) => sql.slice(sql.indexOf("create or replace function public.issue_ordinary_quotation"), sql.indexOf("revoke all on function public.issue_ordinary_quotation"));
  it("same signature, security definer, empty search_path, service_role-only execution", () => {
    const sig = "create or replace function public.issue_ordinary_quotation(\n  p_quotation_id uuid, p_actor uuid, p_valid_until date, p_expected_entity uuid default null, p_audit jsonb default '{}'::jsonb)";
    expect(fn(m72)).toContain(sig);
    expect(fn(m73)).toContain(sig);
    expect(fn(m73)).toContain("security definer set search_path = ''");
    expect(m73).toMatch(/revoke all on function public\.issue_ordinary_quotation\(uuid, uuid, date, uuid, jsonb\) from public, anon, authenticated;\s*grant execute on function public\.issue_ordinary_quotation\(uuid, uuid, date, uuid, jsonb\) to service_role;/);
  });
  it("every safeguard line of the 0172 body is still present: role check, lock order, draft re-check, entity re-read, validity backstops, one update, marker, created_at = issued_at", () => {
    for (const t of ["private.actor_has_role(p_actor, array['admin', 'super_admin'])", "for update;                 -- enquiry first", "for update;   -- then the quotation", "ordift:crew_managed", "ordift:already_issued", "ordift:no_lines", "ordift:no_total",
      "ordift:entity_required", "ordift:entity_changed", "ordift:entity_ineligible", "ordift:validity_in_past", "ordift:validity_needs_super_admin", "set status = 'sent', issued_at = v_issued, issued_by = p_actor, valid_until = p_valid_until",
      "set_config('ordift.issuing_quotation', v_event::text || ':' || q.id::text, true)", "insert into public.activity_log (id, actor_user_id, action, entity_type, entity_id, metadata, created_at)", "'client_quotation.issued'", "'legalDetails'", ", v_issued);",
      "set_config('ordift.issuing_quotation', '', true)"]) expect(fn(m73), t).toContain(t);
    expect(fn(m73).indexOf("update public.client_quotations")).toBeLessThan(fn(m73).indexOf("insert into public.activity_log"));
  });
  it("it changes no existing data and touches no audit-log trigger, index or policy; the guard from 0172 is not replaced", () => {
    const live = m73.replace(/--.*$/gm, "");
    expect(live).not.toMatch(/activity_log_issuance_guard|on public\.activity_log|create trigger activity_log/);
    expect(live).not.toMatch(/delete from public\.(?!\w*activities)/);
    expect(live).toContain("drop function private.entity_issue_standing(uuid, date);");
  });
  it("the catalog seeds name no real number and record no registration, activity licence or entity selection", () => {
    const live = m73.replace(/--.*$/gm, "");
    expect(live).not.toMatch(/insert into public\.(entity_registrations|entity_activities|booking_contracting_entities|employing_entities)/);
    expect(live).not.toMatch(/BN\d|P\d{6}|\bTIN\s*[:=]\s*\w*\d/);
  });
  it("planned activities cannot be licensed by the schema: 'licensed' requires evidence of the same entity, verified and active", () => {
    expect(m73).toContain("constraint entity_activities_licensed_needs_evidence check (status <> 'licensed' or evidence_registration_id is not null)");
    expect(m73).toContain("ordift:activity_evidence_not_this_entity");
    expect(m73).toContain("ordift:activity_evidence_not_verified");
    expect(m73).toContain("rows are never deleted");
  });
});
