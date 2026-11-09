// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ r: vi.fn(), calls: [] as FormData[] }));
vi.mock("./actions", () => ({ createFounderDirectHireAction: async (_p: unknown, fd: FormData) => { h.calls.push(fd); return h.r(fd); } }));
import { FounderDirectHireForm } from "./FounderDirectHireForm";

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let root: Root | null = null; let host: HTMLElement | null = null;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; h.r.mockReset(); h.calls = []; });

const props = { people: [{ id: "u1", label: "Ama Mensah" }, { id: "u2", label: "Kofi Doe" }], positions: [{ id: "pos1", name: "Representative" }], departments: [{ id: "d1", name: "Client Services" }], grades: [{ id: "g1", code: "G4", name: "Associate" }],
  engagementTypes: [{ id: "et1", name: "Employee" }], employingEntities: [{ id: "en1", name: "SYNTHETIC ENTITY" }], employmentJurisdictions: [{ id: "j1", name: "Ghana" }, { id: "j2", name: "Qatar" }] };
const q = <T extends Element>(sel: string) => host!.querySelector(sel) as T;
const submit = async () => { await act(async () => { q<HTMLFormElement>("form").requestSubmit(); await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
function fill() {
  q<HTMLSelectElement>("select[name=directHireProfileId]").value = "u2"; q<HTMLSelectElement>("select[name=employmentJurisdictionId]").value = "j2"; q<HTMLSelectElement>("select[name=gradeId]").value = "g1";
  const t = (sel: string, v: string, proto: object) => { const el = q<HTMLInputElement>(sel); Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
  t("input[name=title]", "Client Engagement Representative", HTMLInputElement.prototype); t("input[name=workLocation]", "Doha", HTMLInputElement.prototype); t("input[name=preferredStartDate]", "2026-12-01", HTMLInputElement.prototype);
  t("textarea[name=justification]", "Covers the new Qatar accounts", HTMLTextAreaElement.prototype);
}

describe("FounderDirectHireForm", () => {
  it("keeps every entry after a refusal (the person, jurisdiction, grade, title, location, date and justification)", async () => {
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); act(() => root!.render(createElement(FounderDirectHireForm, props)));
    fill(); h.r.mockResolvedValue({ ok: false, error: "A requisition already exists for this person." }); await submit();
    expect(host.textContent).toMatch(/already exists for this person/);
    expect(q<HTMLSelectElement>("select[name=directHireProfileId]").value).toBe("u2"); expect(q<HTMLSelectElement>("select[name=employmentJurisdictionId]").value).toBe("j2"); expect(q<HTMLSelectElement>("select[name=gradeId]").value).toBe("g1");
    expect(q<HTMLInputElement>("input[name=title]").value).toBe("Client Engagement Representative"); expect(q<HTMLInputElement>("input[name=workLocation]").value).toBe("Doha");
    expect(q<HTMLInputElement>("input[name=preferredStartDate]").value).toBe("2026-12-01"); expect(q<HTMLTextAreaElement>("textarea[name=justification]").value).toBe("Covers the new Qatar accounts");
  });
  it("resets after a save, and a submitted retry still carries every field", async () => {
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); act(() => root!.render(createElement(FounderDirectHireForm, props)));
    fill(); h.r.mockResolvedValue({ ok: false, error: "No." }); await submit(); h.r.mockResolvedValue({ ok: true }); await submit();
    expect(h.calls[1].get("title")).toBe("Client Engagement Representative"); expect(h.calls[1].get("directHireProfileId")).toBe("u2");
    expect(q<HTMLInputElement>("input[name=title]").value).toBe(""); expect(host.textContent).toMatch(/Requisition created and approved/);
  });
});

describe("FounderDirectHireForm: one requisition per press", () => {
  it("ignores a second submit while the first is still running (a duplicate approved requisition was a real incident)", async () => {
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); act(() => root!.render(createElement(FounderDirectHireForm, props)));
    fill(); let done!: (v: unknown) => void; h.r.mockImplementation(() => new Promise((r) => { done = r; }));
    const f = q<HTMLFormElement>("form"); await act(async () => { f.requestSubmit(); await Promise.resolve(); }); await act(async () => { f.requestSubmit(); await Promise.resolve(); });
    await act(async () => { done({ ok: true }); await Promise.resolve(); }); expect(h.calls.length).toBe(1);
  });
});
