import { describe, expect, it } from "vitest";
import { EML_MAX_BYTES, isEmlFilename, reportedTypeMayBeEml, validateEmlBytes } from "./emlValidation";

// SYNTHETIC messages only (the repository is public).
const enc = (s: string) => new TextEncoder().encode(s);
const message = [
  "Return-Path: <noreply@provider.example>", "Received: from mail.provider.example by mx.example; Sun, 8 Nov 2026 15:42:01 +0300", "From: Provider Team <noreply@provider.example>", "To: someone@example.com",
  "Subject: Your order SYNTH-0001 is confirmed", "Date: Sun, 8 Nov 2026 15:42:00 +0300", "Message-ID: <abc123@provider.example>", "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", "Four payments. Zero interest.", ""].join("\r\n");

describe("original e-mail (.eml) validation", () => {
  it("recognises the file name and the types browsers report for an .eml", () => {
    expect(isEmlFilename("Message.EML")).toBe(true); expect(isEmlFilename("message.eml.pdf")).toBe(false); expect(isEmlFilename("message.txt")).toBe(false);
    for (const t of ["", "message/rfc822", "application/octet-stream", "application/eml"]) expect(reportedTypeMayBeEml(t)).toBe(true);
    for (const t of ["image/png", "text/html", "application/pdf", "application/zip"]) expect(reportedTypeMayBeEml(t)).toBe(false);
  });
  it("accepts a real message and reports a few harmless facts (from, date, subject)", () => {
    const r = validateEmlBytes(enc(message), "provider.eml");
    expect(r).toMatchObject({ ok: true, from: "Provider Team <noreply@provider.example>", date: "Sun, 8 Nov 2026 15:42:00 +0300", subject: "Your order SYNTH-0001 is confirmed" });
    expect(r.ok && r.headerCount).toBeGreaterThanOrEqual(8);
  });
  it("accepts LF-only line endings, folded headers and a UTF-8 byte-order mark", () => {
    const lf = "﻿From: a@example.com\nDate: Sun, 8 Nov 2026 15:42:00 +0300\nSubject: A very long subject that\n  continues on a folded line\n\nbody";
    expect(validateEmlBytes(enc(lf), "x.eml")).toMatchObject({ ok: true, subject: "A very long subject that continues on a folded line" });
  });
  it("refuses a file without the .eml extension, an empty file and an oversized file", () => {
    expect(validateEmlBytes(enc(message), "provider.txt")).toMatchObject({ ok: false });
    expect(validateEmlBytes(new Uint8Array(0), "x.eml")).toMatchObject({ ok: false });
    expect(validateEmlBytes(new Uint8Array(EML_MAX_BYTES + 1).fill(65), "x.eml")).toMatchObject({ ok: false });
  });
  it("refuses a PDF, an image, HTML or JSON wearing an .eml name", () => {
    expect(validateEmlBytes(enc("%PDF-1.7\n%âãÏÓ\n1 0 obj"), "x.eml")).toMatchObject({ ok: false });
    expect(validateEmlBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]), "x.eml")).toMatchObject({ ok: false, error: expect.stringMatching(/binary/) });
    expect(validateEmlBytes(enc("<html><body>Subject: hello</body></html>"), "x.eml")).toMatchObject({ ok: false });
    expect(validateEmlBytes(enc('{"From":"a@example.com","Date":"x"}'), "x.eml")).toMatchObject({ ok: false });
  });
  it("refuses text that is not a message: no headers, a first line that is not a header, or too few usual headers", () => {
    expect(validateEmlBytes(enc("just some notes about a payment\nnothing else"), "x.eml")).toMatchObject({ ok: false });
    expect(validateEmlBytes(enc("X-Note: one\nX-Other: two\n\nbody"), "x.eml")).toMatchObject({ ok: false, error: expect.stringMatching(/who it is from or when/) });
    expect(validateEmlBytes(enc("Subject: only a subject\n\nbody"), "x.eml")).toMatchObject({ ok: false });
  });
});
