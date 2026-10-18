import { describe, expect, it } from "vitest";
import { parseApprovalEmail } from "./approvalEmail";
import { assessApproval, confirmationRequirements, ORDIFT_OWN_DOMAINS, planConfirmation, relationshipWrite, UNVERIFIED_NOTICE, type ApplicationForMatching } from "./approvalSignals";
import { matchOrganisations } from "./names";

const APP: ApplicationForMatching = { reference: "SA-1042", organisationName: "Acme Industries Ltd", contactDomain: "acme.example", submittedOn: "2026-10-10", linkedOrganisation: null };

function email(over: { from?: string; subject?: string; date?: string; body?: string; auth?: string } = {}) {
  const lines = [
    `Authentication-Results: mx.example.net; ${over.auth ?? "dkim=pass header.d=acme.example; spf=pass smtp.mailfrom=acme.example; dmarc=pass header.from=acme.example"}`,
    `From: Procurement <${over.from ?? "procurement@acme.example"}>`,
    "To: Ordift <hello@ordift.example>",
    `Subject: ${over.subject ?? "Supplier application SA-1042 approved"}`,
    `Date: ${over.date ?? "Tue, 20 Oct 2026 09:14:00 +0000"}`,
    "",
    over.body ?? "Acme Industries Ltd is pleased to confirm your supplier application SA-1042 has been approved.",
  ];
  return parseApprovalEmail(lines.join("\n"), { ownDomains: ORDIFT_OWN_DOMAINS });
}

const state = (r: ReturnType<typeof assessApproval>, key: string) => r.signals.find((s) => s.key === key)?.state;

describe("assessApproval", () => {
  it("rates a matching, correctly dated email as strong, but a person must still attest", () => {
    const r = assessApproval(APP, email());
    expect(r.level).toBe("strong");
    expect(confirmationRequirements(r.level)).toEqual({ acknowledgement: true, noteRequired: false });
  });
  it("labels every authentication result as pasted and not independently verified", () => {
    const cases = [
      email(),
      email({ auth: "dkim=fail header.d=acme.example; spf=fail; dmarc=fail" }),
      email({ auth: "spf=pass smtp.mailfrom=acme.example" }),
      parseApprovalEmail("Your supplier application SA-1042 has been approved by Acme Industries Ltd.", { senderAddress: "a@acme.example" }),
    ];
    for (const e of cases) {
      const auth = assessApproval(APP, e).signals.find((s) => s.key === "authentication")!;
      expect(auth.label).toMatch(/as pasted, not independently verified/);
    }
    const passed = assessApproval(APP, email()).signals.find((s) => s.key === "authentication")!;
    expect(passed.detail).toMatch(/not been verified|not independently verified/);
    expect(passed.detail).not.toMatch(/^Passed/);
  });
  it("treats a forward from one of the platform's own domains as a forward, using the real own-domain list", () => {
    expect(ORDIFT_OWN_DOMAINS.length).toBeGreaterThan(0);
    const forwarded = [
      `From: Forwarder <forwarder@${ORDIFT_OWN_DOMAINS[0]}>`,
      "To: Colleague <colleague@ordift.example>",
      "Subject: Fwd: approved",
      "Date: Wed, 21 Oct 2026 08:00:00 +0000",
      "",
      "---------- Forwarded message ---------",
      "From: Procurement <procurement@acme.example>",
      "Date: Tue, 20 Oct 2026 09:14:00 +0000",
      "Subject: Supplier application SA-1042 approved",
      "",
      "Your supplier application SA-1042 has been approved.",
    ].join("\n");
    const parsed = parseApprovalEmail(forwarded, { ownDomains: ORDIFT_OWN_DOMAINS });
    expect(parsed.senderDomain).toBe("acme.example");
    expect(parsed.senderFromForward).toBe(true);
  });
  it("states plainly that nothing was verified with the sender", () => {
    expect(UNVERIFIED_NOTICE).toMatch(/pasted/);
    expect(UNVERIFIED_NOTICE).toMatch(/Nothing was checked with the sending organisation/);
    expect(UNVERIFIED_NOTICE).toMatch(/not proof/);
  });
  it("rates an email from a different domain as weak", () => {
    const r = assessApproval(APP, email({ from: "procurement@lookalike-acme.example", auth: "dkim=pass header.d=lookalike-acme.example; dmarc=pass" }));
    expect(state(r, "sender_domain")).toBe("bad");
    expect(r.level).toBe("weak");
  });
  it("rates a free-mailbox sender as weak even when the text looks right", () => {
    const r = assessApproval(APP, email({ from: "acme.procurement@gmail.com", auth: "dkim=pass header.d=gmail.com; dmarc=pass" }));
    expect(state(r, "sender_domain")).toBe("bad");
    expect(r.level).toBe("weak");
  });
  it("rates an authentication failure as weak", () => {
    const r = assessApproval(APP, email({ auth: "dkim=fail header.d=acme.example; spf=fail; dmarc=fail" }));
    expect(state(r, "authentication")).toBe("bad");
    expect(r.level).toBe("weak");
  });
  it("flags an email dated before the application was submitted", () => {
    const r = assessApproval(APP, email({ date: "Mon, 05 Oct 2026 09:00:00 +0000" }));
    expect(state(r, "date")).toBe("bad");
    expect(r.level).toBe("weak");
  });
  it("flags wording that is not an approval", () => {
    const r = assessApproval(APP, email({ subject: "Supplier application SA-1042", body: "Acme Industries Ltd regrets to inform you that your application was unsuccessful." }));
    expect(state(r, "approval_wording")).toBe("bad");
    expect(r.level).toBe("weak");
  });
  it("asks for review, not strong, when the reference and name are both missing from the text", () => {
    const r = assessApproval(APP, email({ subject: "Welcome", body: "You have been approved as a supplier." }));
    expect(r.level).not.toBe("strong");
  });
  it("cannot be strong when no sender can be read", () => {
    const noSender = parseApprovalEmail("Your supplier application SA-1042 has been approved by Acme Industries Ltd.", { ownDomains: ORDIFT_OWN_DOMAINS });
    expect(assessApproval(APP, noSender).level).not.toBe("strong");
  });
  it("uses the linked organisation's domain when the application has none", () => {
    const app = { ...APP, contactDomain: null, linkedOrganisation: { name: "Acme Industries Ltd", primaryDomain: "acme.example" } };
    expect(state(assessApproval(app, email()), "sender_domain")).toBe("ok");
  });
  it("always requires the person's attestation, and a note for a weak match", () => {
    expect(confirmationRequirements("strong")).toEqual({ acknowledgement: true, noteRequired: false });
    expect(confirmationRequirements("review")).toEqual({ acknowledgement: true, noteRequired: false });
    expect(confirmationRequirements("weak")).toEqual({ acknowledgement: true, noteRequired: true });
  });
});

describe("planConfirmation", () => {
  const dir = [{ id: "org-1", name: "Acme Industries Limited", primaryDomain: "acme.example" }];
  const base = { level: "strong" as const, acknowledgedReview: true, confirmedDistinct: false, note: "", matchesForNew: [] };

  it("confirms a strong match against an existing organisation", () => {
    expect(planConfirmation({ ...base, organisationChoice: { kind: "existing", organisationId: "org-1" } })).toEqual({ ok: true, mode: "link_existing" });
  });
  it("creates a genuinely new organisation when nothing similar exists", () => {
    expect(planConfirmation({ ...base, organisationChoice: { kind: "new", name: "Wayne Enterprises", domain: null } })).toEqual({ ok: true, mode: "create_new" });
  });
  it("refuses to create a duplicate of an existing organisation, even if the box is ticked", () => {
    const matches = matchOrganisations(dir, { name: "ACME Industries Ltd" });
    const plan = planConfirmation({ ...base, organisationChoice: { kind: "new", name: "ACME Industries Ltd", domain: null }, matchesForNew: matches, confirmedDistinct: true });
    expect(plan.ok).toBe(false);
  });
  it("makes the person set aside a very similar organisation explicitly", () => {
    const matches = matchOrganisations(dir, { name: "Acme" });
    expect(matches[0].strength).toBe("likely");
    const blocked = planConfirmation({ ...base, organisationChoice: { kind: "new", name: "Acme", domain: null }, matchesForNew: matches });
    expect(blocked.ok).toBe(false);
    const allowed = planConfirmation({ ...base, organisationChoice: { kind: "new", name: "Acme", domain: null }, matchesForNew: matches, confirmedDistinct: true });
    expect(allowed).toEqual({ ok: true, mode: "create_new" });
  });
  it("never confirms without the person's attestation, even for a strong match", () => {
    const choice = { kind: "existing", organisationId: "org-1" } as const;
    for (const level of ["strong", "review", "weak"] as const) {
      expect(planConfirmation({ ...base, level, acknowledgedReview: false, note: "A sufficiently long note.", organisationChoice: choice }).ok).toBe(false);
    }
  });
  it("requires a note for a weak match", () => {
    const choice = { kind: "existing", organisationId: "org-1" } as const;
    expect(planConfirmation({ ...base, level: "review", organisationChoice: choice }).ok).toBe(true);
    expect(planConfirmation({ ...base, level: "weak", acknowledgedReview: true, organisationChoice: choice }).ok).toBe(false);
    expect(planConfirmation({ ...base, level: "weak", acknowledgedReview: true, note: "Confirmed by phone with their procurement lead.", organisationChoice: choice }).ok).toBe(true);
  });
  it("requires a name for a new organisation", () => {
    expect(planConfirmation({ ...base, organisationChoice: { kind: "new", name: "  ", domain: null } }).ok).toBe(false);
  });
});

describe("relationshipWrite", () => {
  const now = "2026-10-21T10:00:00.000Z";
  it("creates an approved client relationship when none exists", () => {
    expect(relationshipWrite(null, now)).toEqual({ action: "insert", status: "approved", approvedAt: now });
  });
  it("moves a prospect or inactive relationship to approved, dated now", () => {
    expect(relationshipWrite({ status: "prospect", approvedAt: null }, now)).toEqual({ action: "update", status: "approved", approvedAt: now });
    expect(relationshipWrite({ status: "inactive", approvedAt: null }, now).approvedAt).toBe(now);
  });
  it("never rewrites the original approval date of an already-approved relationship", () => {
    const w = relationshipWrite({ status: "approved", approvedAt: "2026-01-05T00:00:00.000Z" }, now);
    expect(w).toEqual({ action: "update", status: "approved", approvedAt: "2026-01-05T00:00:00.000Z" });
  });
});
