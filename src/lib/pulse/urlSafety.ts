// Ordift Pulse — "Check Policy" fetch-safety guard (2026-09-08). This
// introduces the first server-side fetch of an Admin-entered URL
// anywhere in Pulse (every other outbound fetch targets feedUrl/url on
// a source an Admin already vetted as a discovery source — termsUrl has
// never been fetched before this feature). Explicit direction: guard
// against SSRF/internal-network access, reject unsafe redirect
// destinations, and never become a generic unrestricted URL fetcher.
//
// Deliberately NOT a general-purpose "fetch any URL safely" utility —
// this module only answers "is this specific destination safe to send
// an outbound request to," and is used exclusively by
// policyCheckFetch.ts's safeFetchText(), itself used only by
// checkPulseSourcePolicy() (pulseAdmin.ts).
import { promises as dns } from "node:dns";

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "metadata.google.internal"]);
const BLOCKED_HOSTNAME_SUFFIXES = [".local", ".localhost", ".internal"];

// Pure — no I/O. Recognizes IPv4/IPv6 loopback, private (RFC 1918),
// link-local, CGNAT (RFC 6598), unique-local, and other non-public
// ranges a policy-check request must never be allowed to reach,
// including 169.254.169.254 — the cloud-provider instance-metadata
// address that is the classic SSRF target.
export function isPrivateOrReservedIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 0) return true; // 0.0.0.0/8 ("this network")
    if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata 169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (benchmarking)
    if (a >= 224) return true; // multicast (224+) and reserved (240+)
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  // link-local fe80::/10
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
  // unique-local fc00::/7
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — re-check the embedded IPv4
  const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateOrReservedIp(mapped[1]);
  return false;
}

export type UrlSafetyResult = { safe: true } | { safe: false; reason: string };

// Pure, synchronous — protocol + literal-hostname checks that need no
// DNS lookup. Exported separately so it's fully unit-testable without
// network access; isSafeFetchTarget() below layers the (impure, DNS-
// dependent) resolved-address check on top of this.
export function checkUrlSyntaxSafety(rawUrl: string): UrlSafetyResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: "malformed URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { safe: false, reason: `unsupported protocol (${parsed.protocol})` };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) return { safe: false, reason: "blocked hostname" };
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return { safe: false, reason: "blocked hostname suffix" };
  }
  // A literal IP as the hostname (e.g. an attacker-supplied
  // http://169.254.169.254/) can be checked directly, no DNS needed.
  const bareHost = hostname.replace(/^\[/, "").replace(/\]$/, ""); // strip IPv6 brackets, if present
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bareHost) || bareHost.includes(":")) {
    if (isPrivateOrReservedIp(bareHost)) return { safe: false, reason: `private/reserved IP literal (${bareHost})` };
  }
  return { safe: true };
}

// Impure — resolves the hostname and checks every returned address
// (defends against DNS rebinding: a hostname that passes syntax checks
// but resolves to an internal address). Used for both the initial
// request and every redirect hop in policyCheckFetch.ts, so a redirect
// to an internal address is rejected exactly the same way.
export async function isSafeFetchTarget(rawUrl: string): Promise<UrlSafetyResult> {
  const syntax = checkUrlSyntaxSafety(rawUrl);
  if (!syntax.safe) return syntax;
  const hostname = new URL(rawUrl).hostname.replace(/^\[/, "").replace(/\]$/, "");
  // Already validated as a safe literal IP above — nothing left to resolve.
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) || hostname.includes(":")) {
    return { safe: true };
  }
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (records.length === 0) return { safe: false, reason: "DNS resolution returned no addresses" };
    for (const record of records) {
      if (isPrivateOrReservedIp(record.address)) {
        return { safe: false, reason: `hostname resolves to a private/reserved address (${record.address})` };
      }
    }
    return { safe: true };
  } catch {
    return { safe: false, reason: "DNS resolution failed" };
  }
}
