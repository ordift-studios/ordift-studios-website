import { describe, expect, it } from "vitest";
import { TALENT_PUBLICATION_STATUSES, isValidPublicationTransition, isPubliclyVisible } from "./talentPublicationLifecycle";

describe("TALENT_PUBLICATION_STATUSES", () => {
  it("mirrors portfolioProject's own Sanity status vocabulary exactly", () => {
    expect(TALENT_PUBLICATION_STATUSES).toEqual(["draft", "pending_review", "approved", "published", "archived"]);
  });
});

describe("isValidPublicationTransition", () => {
  it("follows the normal forward sequence", () => {
    expect(isValidPublicationTransition("draft", "pending_review")).toBe(true);
    expect(isValidPublicationTransition("pending_review", "approved")).toBe(true);
    expect(isValidPublicationTransition("approved", "published")).toBe(true);
  });
  it("refuses skipping straight from draft to published", () => {
    expect(isValidPublicationTransition("draft", "published")).toBe(false);
    expect(isValidPublicationTransition("pending_review", "published")).toBe(false);
  });
  it("allows sending a profile back for changes", () => {
    expect(isValidPublicationTransition("pending_review", "draft")).toBe(true);
    expect(isValidPublicationTransition("approved", "draft")).toBe(true);
  });
  it("archived can only return through draft, never straight back to published", () => {
    expect(isValidPublicationTransition("archived", "draft")).toBe(true);
    expect(isValidPublicationTransition("archived", "published")).toBe(false);
  });
});

describe("isPubliclyVisible", () => {
  it("true only for published — every other status, including approved, stays non-public", () => {
    for (const status of TALENT_PUBLICATION_STATUSES) {
      expect(isPubliclyVisible(status)).toBe(status === "published");
    }
  });
});
