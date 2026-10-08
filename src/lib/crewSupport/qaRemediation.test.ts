// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseInstant, localInputToIso } from "@/lib/shared/instant";
import { canMarkReady, DEFAULT_QUOTATION_VALIDITY_DAYS, defaultValidUntil, validateStaffAcceptance } from "./quotationRules";
import { quotationStatusLabel, QUOTATION_STATUS_DETAIL } from "@/lib/commercial/quotationStatusLabels";
import { restoreSubmittedValues } from "@/components/admin/ActionForm";

const base = { channel: "email", evidence: "Email from client dated 7 Oct: happy to proceed", acceptedByName: "Ama Mensah", now: new Date("2026-10-07T14:00:00Z"), issuedAt: "2026-10-07T09:00:00Z" };

describe("acceptance time is compared as an exact instant (QA timezone bug)", () => {
  it("a Doha (UTC+3) local 16:00, which is 13:00Z and in the past, is accepted — the server must never read it as 16:00Z", () => {
    const iso = new Date("2026-10-07T13:00:00Z").toISOString();
    expect(validateStaffAcceptance({ ...base, receivedAt: iso }).ok).toBe(true);
  });
  it("an offset-bearing string works for any market's timezone, UTC-8 to UTC+14", () => {
    for (const s of ["2026-10-07T04:00:00-08:00", "2026-10-07T16:30:00+05:30", "2026-10-08T00:00:00+14:00"]) {
      expect(validateStaffAcceptance({ ...base, receivedAt: s }).ok).toBe(true);
    }
  });
  it("a genuinely future instant is still rejected, whatever offset it is written in", () => {
    expect(validateStaffAcceptance({ ...base, receivedAt: "2026-10-07T20:00:00+03:00" }).ok).toBe(false); // 17:00Z > 14:00Z
    expect(validateStaffAcceptance({ ...base, receivedAt: "2026-10-07T15:00:00Z" }).ok).toBe(false);
  });
  it("a naive wall-clock string (no offset) is refused rather than guessed as UTC", () => {
    const r = validateStaffAcceptance({ ...base, receivedAt: "2026-10-07T16:00" });
    expect(r.ok).toBe(false);
    expect(parseInstant("2026-10-07T16:00")).toBeNull();
    expect(parseInstant("2026-10-07T16:00:00Z")).not.toBeNull();
    expect(parseInstant("")).toBeNull();
  });
  it("the browser conversion yields a Z-suffixed instant and blank stays blank", () => {
    expect(localInputToIso("2026-10-07T16:00")).toMatch(/Z$/);
    expect(localInputToIso("")).toBe("");
    expect(localInputToIso("garbage")).toBe("");
  });
  it("no timezone offset is hard-coded anywhere in the acceptance path", () => {
    for (const f of ["src/lib/shared/instant.ts", "src/lib/crewSupport/quotationRules.ts", "src/components/admin/LocalDateTimeField.tsx"]) {
      expect(readFileSync(f, "utf8").replace(/\/\/.*$/gm, "")).not.toMatch(/Qatar|Doha|\+03:00|UTC\+3|3 \* 60/i);
    }
  });
  it("the acceptance form submits the exact instant, not the naive text", () => {
    const field = readFileSync("src/components/admin/LocalDateTimeField.tsx", "utf8");
    expect(field).toContain('type="hidden" name={name}');
    expect(field).not.toMatch(/<input type="datetime-local"[^>]*name=/);
  });
});

describe("a failed submit keeps what the user typed (QA form-wipe bug)", () => {
  it("restores text, textarea, select and checkbox values from the submitted snapshot, leaves hidden fields alone", () => {
    document.body.innerHTML = `<form id="f">
      <input type="hidden" name="quotationId" value="q1">
      <select name="channel"><option value="">Choose…</option><option value="email">Email</option><option value="telephone">Telephone</option></select>
      <input name="acceptedByName" value="">
      <textarea name="evidence"></textarea>
      <input type="checkbox" name="agree" value="yes">
    </form>`;
    const form = document.getElementById("f") as HTMLFormElement;
    const snap = new FormData();
    snap.set("quotationId", "SHOULD-NOT-APPLY"); snap.set("channel", "telephone"); snap.set("acceptedByName", "Ama Mensah"); snap.set("evidence", "Phone call on 7 Oct"); snap.set("agree", "yes");
    restoreSubmittedValues(form, snap);
    expect((form.elements.namedItem("channel") as HTMLSelectElement).value).toBe("telephone");
    expect((form.elements.namedItem("acceptedByName") as HTMLInputElement).value).toBe("Ama Mensah");
    expect((form.elements.namedItem("evidence") as HTMLTextAreaElement).value).toBe("Phone call on 7 Oct");
    expect((form.elements.namedItem("agree") as HTMLInputElement).checked).toBe(true);
    expect((form.elements.namedItem("quotationId") as HTMLInputElement).value).toBe("q1");
  });
  it("ActionForm only restores on a failed result", () => {
    const src = readFileSync("src/components/admin/ActionForm.tsx", "utf8");
    expect(src).toMatch(/state\?\.ok === false && formRef\.current && submitted\.current/);
  });
});

describe("billing unit stays what is stored (QA 'hour' rendering)", () => {
  it("the quotation editor submits through a transition (no React form reset that would revert selects to 'hour')", () => {
    const src = readFileSync("src/app/admin/crew-support/CrewQuotationEditor.tsx", "utf8");
    expect(src).toContain("<form onSubmit={submit}");
    expect(src).not.toContain("<form action={formAction}");
  });
});

describe("dangerous status default removed (QA 'Declined' dropdown)", () => {
  it("the status control starts on a disabled placeholder, never on the first allowed option", () => {
    const src = readFileSync("src/app/admin/crew-support/[id]/page.tsx", "utf8");
    expect(src).toContain('defaultValue="" required');
    expect(src).toContain("Choose a new status…");
    expect(src).not.toContain("defaultValue={firstAllowed}");
  });
});

describe("quotation validity and one status vocabulary", () => {
  it("a default validity is offered, an issued quotation must carry a future date", () => {
    expect(DEFAULT_QUOTATION_VALIDITY_DAYS).toBe(14);
    expect(defaultValidUntil(new Date("2026-10-07T23:30:00Z"))).toBe("2026-10-21");
    expect(defaultValidUntil(new Date("2026-12-25T10:00:00Z"))).toBe("2027-01-08");
    expect(defaultValidUntil(new Date("2026-10-07T10:00:00Z"), 30)).toBe("2026-11-06");
    const ok = { status: "draft", total: 100, lineCount: 1, today: "2026-10-08", terms: "50% deposit on acceptance; cancellation within 48 hours incurs a fee.", eventGap: null };
    expect(canMarkReady({ ...ok, validUntil: null }).ok).toBe(false);
    expect(canMarkReady({ ...ok, validUntil: "2026-10-01" }).ok).toBe(false);
    expect(canMarkReady({ ...ok, validUntil: "2026-10-08" }).ok).toBe(true);
  });
  it("the register and the detail panel describe the same state consistently", () => {
    expect(quotationStatusLabel("sent")).toBe("Issued");
    expect(QUOTATION_STATUS_DETAIL.sent).toMatch(/^Issued/);
    expect(quotationStatusLabel("accepted")).toBe("Accepted");
    expect(readFileSync("src/app/admin/pricing/quotations/page.tsx", "utf8")).toContain("quotationStatusLabel(q.status)");
  });
});

describe("client portal surfaces an awaiting quotation without leaking internals", () => {
  it("the banner and its query expose only commercial fields", () => {
    const src = readFileSync("src/lib/crewSupport/quotation.ts", "utf8");
    const fn = src.slice(src.indexOf("export async function listQuotationsAwaitingAcceptance"));
    expect(fn).toContain('.eq("user_id", userId)');
    expect(fn).not.toMatch(/internal|margin|cost|source_reference|commercial_notes|is_test/);
    const banner = readFileSync("src/components/portal/QuotationAwaitingBanner.tsx", "utf8");
    expect(banner).not.toMatch(/internal|margin|crew cost/i);
  });
});
