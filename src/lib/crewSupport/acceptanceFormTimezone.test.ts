// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import LocalDateTimeField from "@/components/admin/LocalDateTimeField";
import { restoreSubmittedValues } from "@/components/admin/ActionForm";
import { validateStaffAcceptance } from "./quotationRules";

// Renders the REAL acceptance date/time field, types a local wall-clock time
// the way a person does, reads what the browser would actually SUBMIT, and
// feeds that to the real server-side validation — under several timezones.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORIGINAL_TZ = process.env.TZ;
let root: Root | null = null;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; document.body.innerHTML = ""; if (ORIGINAL_TZ === undefined) delete process.env.TZ; else process.env.TZ = ORIGINAL_TZ; });

async function submittedValue(typedLocal: string): Promise<string> {
  const form = document.createElement("form");
  document.body.appendChild(form);
  root = createRoot(form);
  await act(async () => { root!.render(React.createElement(LocalDateTimeField, { name: "receivedAt" })); });
  const visible = form.querySelector('input[type="datetime-local"]') as HTMLInputElement;
  expect(visible.hasAttribute("name")).toBe(false); // the naive text is never submitted
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(visible, typedLocal);
    visible.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return String(new FormData(form).get("receivedAt"));
}

const base = { channel: "email", evidence: "Email from the client: happy to proceed", acceptedByName: "Client", issuedAt: "2026-10-08T14:00:00Z" };

describe("the acceptance field submits an exact instant in the user's own timezone", () => {
  // [timezone, local time typed, expected instant]
  const cases: [string, string, string][] = [
    ["Asia/Qatar", "2026-10-08T20:00", "2026-10-08T17:00:00.000Z"], // UTC+3
    ["America/New_York", "2026-10-08T13:00", "2026-10-08T17:00:00.000Z"], // UTC-4 (DST)
    ["Pacific/Auckland", "2026-10-09T06:00", "2026-10-08T17:00:00.000Z"], // UTC+13 (NZDT)
    ["Europe/London", "2026-10-08T18:00", "2026-10-08T17:00:00.000Z"], // UTC+1 (BST)
    ["UTC", "2026-10-08T17:00", "2026-10-08T17:00:00.000Z"],
  ];
  for (const [tz, typed, expected] of cases) {
    it(`${tz}: typing ${typed} submits ${expected}; a past time is accepted, a later one is refused`, async () => {
      process.env.TZ = tz;
      expect(await submittedValue(typed)).toBe(expected);
      // Server "now" is 17:30Z: 17:00Z is in the past (accepted)…
      expect(validateStaffAcceptance({ ...base, receivedAt: expected, now: new Date("2026-10-08T17:30:00Z") }).ok).toBe(true);
      // …and the same wall-clock time is a genuinely future instant when "now" is 16:00Z (refused).
      const r = validateStaffAcceptance({ ...base, receivedAt: expected, now: new Date("2026-10-08T16:00:00Z") });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/future/);
    });
  }
  it("a blank field submits nothing usable, and the naive string is refused if it ever reached the server", async () => {
    process.env.TZ = "Asia/Qatar";
    expect(await submittedValue("")).toBe("");
    expect(validateStaffAcceptance({ ...base, receivedAt: "2026-10-08T20:00", now: new Date("2026-10-08T17:30:00Z") }).ok).toBe(false);
  });
  it("after a failed submit the other fields are put back (the datetime field keeps its own state)", () => {
    document.body.innerHTML = `<form id="f"><select name="channel"><option value="">Choose…</option><option value="email">Email</option></select><input name="acceptedByName"><textarea name="evidence"></textarea></form>`;
    const form = document.getElementById("f") as HTMLFormElement;
    const snap = new FormData();
    snap.set("channel", "email"); snap.set("acceptedByName", "Ama Mensah"); snap.set("evidence", "Email dated 8 Oct");
    restoreSubmittedValues(form, snap);
    expect((form.elements.namedItem("channel") as HTMLSelectElement).value).toBe("email");
    expect((form.elements.namedItem("acceptedByName") as HTMLInputElement).value).toBe("Ama Mensah");
    expect((form.elements.namedItem("evidence") as HTMLTextAreaElement).value).toBe("Email dated 8 Oct");
  });
});
