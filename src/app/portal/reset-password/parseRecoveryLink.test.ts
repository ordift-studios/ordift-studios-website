import { describe, expect, it } from "vitest";
import { parseRecoveryLink } from "./parseRecoveryLink";

describe("parseRecoveryLink", () => {
  it("1. recognizes a valid PKCE code", () => {
    expect(parseRecoveryLink("?code=abc123", "")).toEqual({ kind: "code", code: "abc123" });
  });

  it("1. recognizes a valid token_hash + type=recovery", () => {
    expect(parseRecoveryLink("?token_hash=xyz789&type=recovery", "")).toEqual({ kind: "token_hash", tokenHash: "xyz789" });
  });

  it("1. recognizes valid fragment access_token + refresh_token", () => {
    expect(parseRecoveryLink("", "#access_token=aaa&refresh_token=bbb&type=recovery")).toEqual({
      kind: "fragment",
      accessToken: "aaa",
      refreshToken: "bbb",
    });
  });

  it("1. accepts a fragment given without the leading '#'", () => {
    expect(parseRecoveryLink("", "access_token=aaa&refresh_token=bbb")).toEqual({ kind: "fragment", accessToken: "aaa", refreshToken: "bbb" });
  });

  it("2. does not treat a token_hash for a different EmailOtpType as a valid recovery link — never invents type=recovery", () => {
    expect(parseRecoveryLink("?token_hash=xyz789&type=signup", "")).toEqual({ kind: "none" });
    expect(parseRecoveryLink("?token_hash=xyz789&type=magiclink", "")).toEqual({ kind: "none" });
    expect(parseRecoveryLink("?token_hash=xyz789", "")).toEqual({ kind: "none" });
  });

  it("2. an incomplete fragment (only one of access_token/refresh_token) is invalid, not partially accepted", () => {
    expect(parseRecoveryLink("", "#access_token=aaa")).toEqual({ kind: "none" });
    expect(parseRecoveryLink("", "#refresh_token=bbb")).toEqual({ kind: "none" });
  });

  it("3. missing recovery data entirely (no query, no fragment) is invalid", () => {
    expect(parseRecoveryLink("", "")).toEqual({ kind: "none" });
    expect(parseRecoveryLink("?", "#")).toEqual({ kind: "none" });
  });

  it("an unrelated query string (no recovery params at all) is invalid, never mistaken for a fragment leak", () => {
    expect(parseRecoveryLink("?utm_source=email&foo=bar", "")).toEqual({ kind: "none" });
  });

  it("prefers `code` over `token_hash`/fragment when more than one is somehow present, deterministically — never guesses", () => {
    expect(parseRecoveryLink("?code=abc&token_hash=xyz&type=recovery", "#access_token=aaa&refresh_token=bbb")).toEqual({ kind: "code", code: "abc" });
  });

  it("prefers `token_hash` over the fragment when both are present without a code", () => {
    expect(parseRecoveryLink("?token_hash=xyz&type=recovery", "#access_token=aaa&refresh_token=bbb")).toEqual({ kind: "token_hash", tokenHash: "xyz" });
  });
});
