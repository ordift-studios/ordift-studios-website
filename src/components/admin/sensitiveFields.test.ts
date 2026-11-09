// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { isSensitiveField } from "./ActionForm";
import { useRestoringActionState } from "./useRestoringActionState";

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let root: Root | null = null; let host: HTMLElement | null = null;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });
type S = { ok: true; message: string } | { ok: false; error: string } | null;

describe("isSensitiveField", () => {
  it("flags card, security code, password, one-time code, PIN, secret, token and API key fields by name, id or autocomplete hint", () => {
    for (const f of [{ name: "cardNumber" }, { name: "card_number" }, { name: "cvv" }, { name: "cvc" }, { name: "securityCode" }, { name: "password" }, { name: "newPassword" }, { name: "passcode" }, { name: "otp" }, { name: "pin" },
      { name: "apiKey" }, { name: "api_key" }, { name: "clientSecret" }, { name: "accessToken" }, { name: "x", autocomplete: "cc-number" }, { name: "x", autocomplete: "cc-csc" }, { name: "x", autocomplete: "one-time-code" },
      { name: "x", autocomplete: "new-password" }, { name: "x", id: "card-number" }]) expect(isSensitiveField(f), JSON.stringify(f)).toBe(true);
  });
  it("does not flag ordinary fields (names, notes, amounts, references, dates, emails, an account label)", () => {
    for (const f of [{ name: "name" }, { name: "notes" }, { name: "amountDue" }, { name: "referenceNote" }, { name: "keyword" }, { name: "startDate" }, { name: "email" }, { name: "phone" }, { name: "description" }, { name: "x", autocomplete: "email" }, { name: "x", autocomplete: "off" }]) expect(isSensitiveField(f), JSON.stringify(f)).toBe(false);
  });
});

describe("a refused submission keeps ordinary entries and never puts sensitive ones back", () => {
  it("restores the name and notes but leaves card number, security code, one-time code, password and token EMPTY", async () => {
    function Form() {
      const [state, formAction, , formRef] = useRestoringActionState<S>(async () => ({ ok: false, error: "Refused." }), null);
      return createElement("form", { ref: formRef, action: formAction },
        createElement("input", { name: "name", id: "name" }), createElement("textarea", { name: "notes", id: "notes" }),
        createElement("input", { name: "cardNumber", id: "cardNumber" }), createElement("input", { name: "field1", id: "field1", autoComplete: "cc-csc" }),
        createElement("input", { name: "field2", id: "field2", autoComplete: "one-time-code" }), createElement("input", { name: "accessToken", id: "accessToken" }), createElement("input", { name: "pin", id: "pin" }),
        createElement("button", { type: "submit", id: "go" }, "go"), state?.ok === false ? createElement("p", { id: "err" }, state.error) : null);
    }
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); act(() => root!.render(createElement(Form)));
    const el = (id: string) => document.getElementById(id) as HTMLInputElement;
    el("name").value = "Kofi Mensah"; el("notes").value = "Please call first"; for (const id of ["cardNumber", "field1", "field2", "accessToken", "pin"]) el(id).value = "4111111111111111";
    await act(async () => { el("go").closest("form")!.requestSubmit(); await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(el("err").textContent).toBe("Refused.");
    expect(el("name").value).toBe("Kofi Mensah"); expect(el("notes").value).toBe("Please call first");
    for (const id of ["cardNumber", "field1", "field2", "accessToken", "pin"]) expect(el(id).value, id).toBe("");
  });
});
