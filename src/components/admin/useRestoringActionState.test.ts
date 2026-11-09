// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { isRefusal, useRestoringActionState } from "./useRestoringActionState";

// React needs this flag to run updates synchronously inside act() in a test environment.
beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });

type S = { ok: true; message: string } | { ok: false; error: string } | null;
let root: Root | null = null; let host: HTMLElement | null = null;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });

function mount(action: (prev: S, fd: FormData) => Promise<S>, restoring: boolean) {
  function Form() {
    const [state, formAction, , formRef] = useRestoringActionState<S>(action, null);
    return createElement("form", { ref: restoring ? formRef : undefined, action: formAction },
      createElement("input", { name: "name", id: "name" }), createElement("textarea", { name: "notes", id: "notes" }),
      createElement("select", { name: "kind", id: "kind" }, createElement("option", { value: "a" }, "a"), createElement("option", { value: "b" }, "b")),
      createElement("input", { type: "checkbox", name: "agree", id: "agree" }), createElement("input", { type: "radio", name: "pick", value: "x", id: "rx" }), createElement("input", { type: "radio", name: "pick", value: "y", id: "ry" }),
      createElement("input", { type: "password", name: "secret", id: "secret" }),
      createElement("button", { type: "submit", id: "go" }, "go"), state?.ok === false ? createElement("p", { role: "alert", id: "err" }, state.error) : null, state?.ok === true ? createElement("p", { id: "ok" }, state.message) : null);
  }
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  act(() => root!.render(createElement(Form)));
  return host;
}
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fill = () => { el<HTMLInputElement>("name").value = "Kofi Mensah"; el<HTMLTextAreaElement>("notes").value = "line one\nline two"; el<HTMLSelectElement>("kind").value = "b"; el<HTMLInputElement>("agree").checked = true; el<HTMLInputElement>("ry").checked = true; el<HTMLInputElement>("secret").value = "hunter2"; };
const submit = async () => { await act(async () => { el<HTMLFormElement>("go").closest("form")!.requestSubmit(); await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

describe("useRestoringActionState", () => {
  it("keeps what was typed after a REFUSED submission: text, textarea, select, checkbox and radio (never a password)", async () => {
    mount(async () => ({ ok: false, error: "Evidence is required." }), true); fill(); await submit();
    expect(el("err").textContent).toBe("Evidence is required.");
    expect(el<HTMLInputElement>("name").value).toBe("Kofi Mensah"); expect(el<HTMLTextAreaElement>("notes").value).toBe("line one\nline two"); expect(el<HTMLSelectElement>("kind").value).toBe("b");
    expect(el<HTMLInputElement>("agree").checked).toBe(true); expect(el<HTMLInputElement>("ry").checked).toBe(true); expect(el<HTMLInputElement>("rx").checked).toBe(false);
    expect(el<HTMLInputElement>("secret").value).toBe("");                                          // a password is never put back
  });
  it("keeps React's normal reset after a SUCCESSFUL submission", async () => {
    mount(async () => ({ ok: true, message: "Saved." }), true); fill(); await submit();
    expect(el("ok").textContent).toBe("Saved."); expect(el<HTMLInputElement>("name").value).toBe(""); expect(el<HTMLInputElement>("agree").checked).toBe(false);
  });
  it("shows the problem this fixes: without the hook's ref the same refusal wipes the fields", async () => {
    mount(async () => ({ ok: false, error: "No." }), false); fill(); await submit();
    expect(el<HTMLInputElement>("name").value).toBe("");
  });
});

describe("isRefusal", () => {
  it("recognises ok:false, and the older error-only shape, and nothing else", () => {
    expect(isRefusal({ ok: false, error: "x" })).toBe(true); expect(isRefusal({ error: "x" })).toBe(true);
    expect(isRefusal({ ok: true, message: "x" })).toBe(false); expect(isRefusal({ ok: true, error: "x" })).toBe(false); expect(isRefusal(null)).toBe(false); expect(isRefusal({ error: "" })).toBe(false);
  });
});
