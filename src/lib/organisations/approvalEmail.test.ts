import { describe, expect, it } from "vitest";
import { excerptOf, normalisedForHash, parseApprovalEmail, senderDomainFromAddress } from "./approvalEmail";

// Reserved example domain (RFC 2606) standing in for "an address of our own" so no real company mailbox appears in test fixtures.
const OWN = ["ordift.example"];

const WITH_HEADERS = [
  "Delivered-To: someone@ordift.example",
  "Authentication-Results: mx.example.net; dkim=pass header.d=acme.example header.i=@acme.example; spf=pass smtp.mailfrom=acme.example; dmarc=pass header.from=acme.example",
  "From: Procurement Desk <procurement@mail.acme.example>",
  "To: Ordift Studios <hello@ordift.example>",
  "Subject: Supplier application SA-1042 approved",
  "Date: Tue, 20 Oct 2026 09:14:00 +0000",
  "Message-ID: <abc@mail.acme.example>",
  "",
  "Dear Ordift Studios,",
  "",
  "We are pleased to confirm that your supplier application SA-1042 has been approved.",
].join("\n");

describe("parseApprovalEmail", () => {
  it("reads sender domain, subject, date and authentication from pasted headers", () => {
    const p = parseApprovalEmail(WITH_HEADERS, { ownDomains: OWN });
    expect(p.hasHeaders).toBe(true);
    expect(p.senderDomain).toBe("mail.acme.example");
    expect(p.subject).toBe("Supplier application SA-1042 approved");
    expect(p.sentOn).toBe("2026-10-20");
    expect([p.spf, p.dkim, p.dmarc]).toEqual(["pass", "pass", "pass"]);
    expect(p.dkimAligned).toBe(true);
    expect(p.bodyText).toContain("SA-1042 has been approved");
  });
  it("does not call DKIM aligned when the signing domain differs from the sender", () => {
    const spoof = WITH_HEADERS.replace("header.d=acme.example header.i=@acme.example", "header.d=other.example header.i=@other.example").replace("dmarc=pass", "dmarc=none");
    expect(parseApprovalEmail(spoof, { ownDomains: OWN }).dkimAligned).toBe(false);
  });
  it("records a failure verdict", () => {
    const failed = WITH_HEADERS.replace("spf=pass", "spf=fail");
    expect(parseApprovalEmail(failed, { ownDomains: OWN }).spf).toBe("fail");
  });
  it("accepts a bare body and a typed sender address, and reports unknown authentication", () => {
    const p = parseApprovalEmail("Your supplier application has been approved. Welcome aboard.", { senderAddress: "Jane <jane@acme.example>", ownDomains: OWN });
    expect(p.hasHeaders).toBe(false);
    expect(p.senderDomain).toBe("acme.example");
    expect([p.spf, p.dkim, p.dmarc]).toEqual(["unknown", "unknown", "unknown"]);
  });
  it("reads the original sender from a forwarded block when the From header is an Ordift address", () => {
    const forwarded = [
      "From: Founder <founder@ordift.example>",
      "To: Admin <admin@ordift.example>",
      "Subject: Fwd: Approved",
      "Date: Wed, 21 Oct 2026 08:00:00 +0000",
      "",
      "---------- Forwarded message ---------",
      "From: Procurement <procurement@acme.example>",
      "Date: Tue, 20 Oct 2026 09:14:00 +0000",
      "Subject: Supplier application approved",
      "",
      "Your application has been approved.",
    ].join("\n");
    const p = parseApprovalEmail(forwarded, { ownDomains: OWN });
    expect(p.senderDomain).toBe("acme.example");
    expect(p.senderFromForward).toBe(true);
    expect(p.sentOn).toBe("2026-10-20");
    // The verdicts describe the forward, not the original, so they are not claimed.
    expect(p.dkim).toBe("unknown");
    expect(p.dkimAligned).toBe(false);
  });
  it("strips HTML markup from the body", () => {
    const p = parseApprovalEmail("<html><body><p>Application <b>approved</b></p><style>x{}</style></body></html>", { senderAddress: "a@acme.example" });
    expect(p.bodyText).toContain("approved");
    expect(p.bodyText).not.toContain("<b>");
    expect(p.bodyText).not.toContain("x{}");
  });
  it("does not mistake an ordinary 'Note: text' first line for a header block", () => {
    const p = parseApprovalEmail("Note: please see below\nYour application is approved.", { senderAddress: "a@acme.example" });
    expect(p.hasHeaders).toBe(false);
  });
});

describe("helpers", () => {
  it("extracts only the domain of an address", () => {
    expect(senderDomainFromAddress("Jane Doe <Jane.Doe@Mail.Example.COM>")).toBe("mail.example.com");
    expect(senderDomainFromAddress("nonsense")).toBeNull();
  });
  it("normalises text for duplicate detection regardless of spacing and case", () => {
    expect(normalisedForHash("Hello\r\n  WORLD ")).toBe(normalisedForHash("hello world"));
  });
  it("limits the stored excerpt", () => {
    expect(excerptOf("x ".repeat(5000)).length).toBeLessThanOrEqual(1500);
  });
});
