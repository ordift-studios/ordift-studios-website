import { describe, expect, it } from "vitest";
import { isPrivateOrReservedIp, checkUrlSyntaxSafety } from "./urlSafety";

// Rights Intelligence, "Check Policy" fetch-safety guard (2026-09-08).
// isSafeFetchTarget() itself is DNS-dependent (impure) for a hostname
// target and is exercised indirectly via policyCheck.test.ts's doc-test
// (see that file for why real DNS lookups are not run inside this
// suite — same established limitation/pattern as every other
// network-dependent module in this codebase). Everything tested here —
// isPrivateOrReservedIp and checkUrlSyntaxSafety — is pure/synchronous
// and needs no network access at all, including every literal-IP case
// (a literal IP hostname never triggers a DNS lookup in the first
// place, so these ARE the real safety checks for that class of attack,
// not just a proxy for them).

describe("isPrivateOrReservedIp — IPv4", () => {
  it("flags loopback (127.0.0.0/8)", () => {
    expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
  });
  it("flags the classic cloud-metadata SSRF target (169.254.169.254)", () => {
    expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
  });
  it("flags RFC 1918 private ranges", () => {
    expect(isPrivateOrReservedIp("10.0.0.5")).toBe(true);
    expect(isPrivateOrReservedIp("172.16.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("172.31.255.254")).toBe(true);
    expect(isPrivateOrReservedIp("192.168.1.1")).toBe(true);
  });
  it("flags CGNAT (100.64.0.0/10)", () => {
    expect(isPrivateOrReservedIp("100.64.0.1")).toBe(true);
  });
  it("flags 0.0.0.0/8", () => {
    expect(isPrivateOrReservedIp("0.0.0.0")).toBe(true);
  });
  it("does NOT flag a genuinely public IPv4 address", () => {
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIp("203.0.113.10")).toBe(false);
  });
  it("does not misclassify a 172.x address outside the 172.16.0.0/12 private range as private", () => {
    expect(isPrivateOrReservedIp("172.15.0.1")).toBe(false);
    expect(isPrivateOrReservedIp("172.32.0.1")).toBe(false);
  });
});

describe("isPrivateOrReservedIp — IPv6", () => {
  it("flags loopback (::1) and unspecified (::)", () => {
    expect(isPrivateOrReservedIp("::1")).toBe(true);
    expect(isPrivateOrReservedIp("::")).toBe(true);
  });
  it("flags link-local (fe80::/10)", () => {
    expect(isPrivateOrReservedIp("fe80::1")).toBe(true);
  });
  it("flags unique-local (fc00::/7)", () => {
    expect(isPrivateOrReservedIp("fd00::1")).toBe(true);
  });
  it("resolves an IPv4-mapped IPv6 address through the same IPv4 rules", () => {
    expect(isPrivateOrReservedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("checkUrlSyntaxSafety", () => {
  it("rejects a malformed URL", () => {
    expect(checkUrlSyntaxSafety("not a url").safe).toBe(false);
  });
  it("rejects a non-http(s) protocol", () => {
    expect(checkUrlSyntaxSafety("file:///etc/passwd").safe).toBe(false);
    expect(checkUrlSyntaxSafety("ftp://example.com/terms").safe).toBe(false);
  });
  it("accepts http and https", () => {
    expect(checkUrlSyntaxSafety("http://example.com/terms").safe).toBe(true);
    expect(checkUrlSyntaxSafety("https://example.com/terms").safe).toBe(true);
  });
  it("rejects a literal localhost/loopback hostname without needing DNS", () => {
    expect(checkUrlSyntaxSafety("http://localhost/terms").safe).toBe(false);
    expect(checkUrlSyntaxSafety("http://127.0.0.1/terms").safe).toBe(false);
  });
  it("rejects a literal cloud-metadata IP without needing DNS — the classic SSRF target", () => {
    expect(checkUrlSyntaxSafety("http://169.254.169.254/latest/meta-data/").safe).toBe(false);
  });
  it("rejects a literal RFC 1918 private-IP hostname without needing DNS", () => {
    expect(checkUrlSyntaxSafety("http://10.0.0.5/terms").safe).toBe(false);
    expect(checkUrlSyntaxSafety("http://192.168.1.1/terms").safe).toBe(false);
  });
  it("rejects .internal/.local hostname suffixes", () => {
    expect(checkUrlSyntaxSafety("http://backend.internal/terms").safe).toBe(false);
    expect(checkUrlSyntaxSafety("http://printer.local/terms").safe).toBe(false);
  });
  it("accepts a plausible real public policy-page URL by syntax alone (DNS/redirect safety is layered on separately)", () => {
    expect(checkUrlSyntaxSafety("https://www.nikon.com/terms").safe).toBe(true);
  });
});
