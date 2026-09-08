// Ordift Pulse — "Check Policy" bounded/redirect-safe fetch (2026-09-08).
// The only place in this codebase that fetches an Admin-entered
// termsUrl. Every redirect hop is re-validated through
// isSafeFetchTarget() before being followed (redirect: "manual" — never
// let the runtime follow a redirect on our behalf, unvalidated), the
// request always carries a hard timeout, and the response body is read
// with a byte cap so a huge or slow-drip response can't tie up the
// request or bloat what gets passed to evaluatePolicyText(). Only
// text/html and text/plain are accepted — anything else (a PDF, an
// image, a binary download) is refused rather than parsed.
import { isSafeFetchTarget } from "./urlSafety";

export type PolicyFetchResult =
  | {
      ok: true;
      text: string;
      contentType: string;
      // One-Hop Official-Policy Gateway Resolution (2026-09-08) — the
      // URL actually reached after following every redirect hop, which
      // can differ from the URL passed in. Callers that need to trust a
      // fetched page's OWN links as "official" (the fallback-discovery
      // path) must verify this — not the originally-requested URL —
      // is still within the official-domain trust boundary, since a
      // redirect can otherwise silently move the response off-domain
      // while every individual hop still passes the (domain-agnostic)
      // SSRF safety check.
      finalUrl: string;
    }
  | { ok: false; reason: string };

export const POLICY_FETCH_TIMEOUT_MS = 10_000;
export const POLICY_FETCH_MAX_BYTES = 300_000; // ~300KB — far more than any real terms page's relevant text, well short of "the full page" as a concern
const MAX_REDIRECTS = 3;

export async function safeFetchText(
  startUrl: string,
  maxBytes: number = POLICY_FETCH_MAX_BYTES,
  timeoutMs: number = POLICY_FETCH_TIMEOUT_MS
): Promise<PolicyFetchResult> {
  let currentUrl = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const safety = await isSafeFetchTarget(currentUrl);
    if (!safety.safe) return { ok: false, reason: `unsafe destination — ${safety.reason}` };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "OrdiftPulsePolicyChecker/1.0 (+https://ordiftstudios.com)" },
      });
    } catch (error) {
      clearTimeout(timer);
      const isAbort = error instanceof Error && error.name === "AbortError";
      return { ok: false, reason: isAbort ? "timeout" : "network error" };
    }
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, reason: `redirect (${response.status}) with no Location header` };
      try {
        currentUrl = new URL(location, currentUrl).toString();
      } catch {
        return { ok: false, reason: "redirect to a malformed URL" };
      }
      continue; // re-validate the new destination on the next loop iteration
    }

    if (response.status < 200 || response.status >= 300) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain/i.test(contentType)) {
      return { ok: false, reason: `unsupported content type (${contentType || "unknown"})` };
    }

    const reader = response.body?.getReader();
    if (!reader) return { ok: false, reason: "empty response body" };

    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        const remaining = maxBytes - received;
        if (remaining <= 0) {
          await reader.cancel().catch(() => {});
          break;
        }
        const slice = value.byteLength > remaining ? value.slice(0, remaining) : value;
        chunks.push(slice);
        received += slice.byteLength;
        if (received >= maxBytes) {
          await reader.cancel().catch(() => {});
          break;
        }
      }
    }
    const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
    return { ok: true, text, contentType, finalUrl: currentUrl };
  }

  return { ok: false, reason: "too many redirects" };
}
