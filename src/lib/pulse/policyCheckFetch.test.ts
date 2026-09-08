import { describe, expect, it, vi, afterEach } from "vitest";
import { safeFetchText } from "./policyCheckFetch";

// Rights Intelligence, "Check Policy" bounded/redirect-safe fetch
// (2026-09-08). global.fetch is mocked throughout — no real network
// access — using literal TEST-NET-3 (203.0.113.0/24, RFC 5737
// documentation-only) addresses as the "public" destination, which are
// syntax-safe without any DNS lookup (a literal IP hostname never
// triggers DNS resolution — see urlSafety.ts), so these are genuinely
// deterministic, network-free tests, not just doc-tests standing in for
// them.
const PUBLIC_TEST_URL = "http://203.0.113.10/terms";

describe("safeFetchText", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns ok:true with the response text for a normal text/html 200 response", async () => {
    global.fetch = vi.fn(async () => new Response("<p>All rights reserved.</p>", { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    const result = await safeFetchText(PUBLIC_TEST_URL);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain("All rights reserved");
  });

  it("rejects an unsafe destination before ever calling fetch at all (SSRF guard runs first)", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const result = await safeFetchText("http://169.254.169.254/latest/meta-data/");
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("treats a non-2xx status (404) as a failure, never as content to evaluate", async () => {
    global.fetch = vi.fn(async () => new Response("Not Found", { status: 404 })) as unknown as typeof fetch;
    const result = await safeFetchText(PUBLIC_TEST_URL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("404");
  });

  it("rejects an unsupported content type (e.g. a PDF) rather than parsing it", async () => {
    global.fetch = vi.fn(async () => new Response("%PDF-1.4 ...", { status: 200, headers: { "content-type": "application/pdf" } })) as unknown as typeof fetch;
    const result = await safeFetchText(PUBLIC_TEST_URL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("unsupported content type");
  });

  it("re-validates a redirect target through the safety check before following it — rejects a redirect into a private address", async () => {
    global.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === PUBLIC_TEST_URL) {
        return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/secrets" } });
      }
      throw new Error("must never fetch the redirect target once it's rejected as unsafe");
    }) as unknown as typeof fetch;
    const result = await safeFetchText(PUBLIC_TEST_URL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/unsafe destination/);
  });

  it("follows a redirect to a safe destination and evaluates its content", async () => {
    const finalUrl = "http://203.0.113.20/terms-final";
    global.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === PUBLIC_TEST_URL) return new Response(null, { status: 301, headers: { location: finalUrl } });
      if (url === finalUrl) return new Response("Photographs may not be reproduced without prior written consent.", { status: 200, headers: { "content-type": "text/plain" } });
      throw new Error(`unexpected url ${url}`);
    }) as unknown as typeof fetch;
    const result = await safeFetchText(PUBLIC_TEST_URL);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toContain("Photographs");
  });

  it("gives up after too many redirects rather than following an unbounded chain", async () => {
    let hop = 0;
    global.fetch = vi.fn(async () => {
      hop += 1;
      return new Response(null, { status: 302, headers: { location: `http://203.0.113.${10 + hop}/next` } });
    }) as unknown as typeof fetch;
    const result = await safeFetchText(PUBLIC_TEST_URL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("too many redirects");
  });

  it("bounds the response body to maxBytes rather than reading an unbounded stream", async () => {
    const large = "a".repeat(1000);
    global.fetch = vi.fn(async () => new Response(large, { status: 200, headers: { "content-type": "text/plain" } })) as unknown as typeof fetch;
    const result = await safeFetchText(PUBLIC_TEST_URL, 100);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text.length).toBeLessThanOrEqual(100);
  });

  it("reports an aborted request as a timeout, not a generic network error", async () => {
    global.fetch = vi.fn(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }) as unknown as typeof fetch;
    const result = await safeFetchText(PUBLIC_TEST_URL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timeout");
  });

  it("reports a redirect response with no Location header as a failure rather than following nothing", async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 302 })) as unknown as typeof fetch;
    const result = await safeFetchText(PUBLIC_TEST_URL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("no Location header");
  });
});
