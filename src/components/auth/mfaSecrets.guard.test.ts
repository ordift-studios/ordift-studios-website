import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Acceptance guard: the authenticator-app screens must never display, log or transmit secrets other than showing the QR/setup key to the person enrolling.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const files = { panel: read("./MfaPanel.tsx"), stepUp: read("./StepUp.tsx"), client: read("../../lib/auth/mfaClient.ts"), rules: read("../../lib/auth/stepUp.ts"), page: read("../../app/admin/security/page.tsx") };

describe("authenticator-app screens keep secrets in the browser and out of logs", () => {
  it("nothing logs, stores or beacons anything", () => {
    for (const [name, src] of Object.entries(files)) {
      for (const bad of ["console.", "localStorage", "sessionStorage", "document.cookie", "sendBeacon", "indexedDB", "XMLHttpRequest", "Sentry", "captureException", "logActivity"]) expect(src, `${name} must not contain ${bad}`).not.toContain(bad);
    }
  });
  it("the components and helpers are browser-only: no server actions, no server or admin clients, no fetch to this site", () => {
    for (const name of ["panel", "stepUp", "client", "rules"] as const) {
      const src = files[name];
      expect(src).not.toContain("use server"); expect(src).not.toMatch(/supabase\/(server|admin)/); expect(src).not.toContain("fetch(");
      expect(src).not.toMatch(/next\/headers|next\/cache/);
    }
    expect(files.panel).toContain('"use client"'); expect(files.stepUp).toContain('"use client"');
  });
  it("the setup key and QR code appear only in the enrolment helper and the panel, and are cleared when the setup ends", () => {
    for (const k of ["stepUp", "rules", "page"] as const) expect(files[k]).not.toMatch(/setupKey|qrCode|qr_code|totp\.secret/i);
    expect(files.panel).toContain("const clearSetup = () => { setSetup(null); setShowKey(false);");
    expect(files.panel).toContain("setCode(\"\")");                                    // a code is cleared as soon as it is used
    expect(files.stepUp).toContain("setCode(\"\")");
    expect(files.panel).not.toMatch(/href=\{[^}]*(setupKey|qrCode)/);                  // never put into a link or address
  });
  it("the security page passes nothing to the panel and is limited to management users", () => {
    expect(files.page).toContain("<MfaPanel />"); expect(files.page).toContain("isManagementUser"); expect(files.page).toContain('redirect("/admin/overview")');
  });
  it("the step-up prompt no longer depends on the ticket switch: irreversible actions need a recent second factor in every mode (migration 0185 revision 4)", () => {
    expect(files.stepUp).not.toContain("AUTHORITY_TICKETS_ENABLED");
    expect(files.stepUp).toContain("return <StepUpPrompt variant={variant} />");
    expect(files.stepUp).toContain("This action cannot be undone.");          // the warning on the erasure screens is preserved (the default variant)
  });
  it("the ticket-path check handles no secret or code, writes nothing, and is limited to management users", () => {
    const comp = read("./TicketCheck.tsx"), act = read("../../app/admin/security/ticketCheckActions.ts");
    for (const [name, src] of Object.entries({ comp, act })) for (const bad of ["console.", "localStorage", "sessionStorage", "sendBeacon", "totp", "secret", "recovery"]) expect(src.toLowerCase(), `${name} must not contain ${bad}`).not.toContain(bad.toLowerCase());
    expect(act).toContain("isManagementUser"); expect(act).toContain('"ticket-check"'); expect(act).not.toMatch(/createAdminClient|\.insert\(|\.update\(|\.delete\(/);
    expect(read("../../app/admin/security/page.tsx")).toContain("<TicketCheck />");
  });
  it("there are no recovery codes: the screens say so and none are generated or stored", () => {
    expect(files.panel).toContain("There are no recovery codes to lose or leak");
    for (const src of Object.values(files)) expect(src).not.toMatch(/recoveryCode|backupCode|generateRecovery/i);
  });
});
