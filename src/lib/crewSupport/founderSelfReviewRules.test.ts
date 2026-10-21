import { describe, expect, it } from "vitest";
import {
  FSR_CONFLICT_ACKNOWLEDGEMENT,
  FSR_MAX_FILES_PER_DECLARATION,
  LINKED_LOGIN_MESSAGE,
  buildSelectionSnapshot,
  checkReleaseSelection,
  checkReviewSelection,
  declarationOutcome,
  decisionToStatus,
  resolveFounderContext,
  validateJustification,
  validateTypedCount,
  type ContextFacts,
  type ExceptionFile,
} from "./founderSelfReviewRules";

const FOUNDER = "founder-profile";
const SECOND = "second-login";
const OTHER = "another-person";
const ENG = "eng-1";
const file = (id: string, over: Partial<ExceptionFile> = {}): ExceptionFile => ({ id, fileKind: "deliverable", releaseStatus: "submitted", purged: false, engagementId: ENG, version: 1, sizeBytes: 1000, storagePath: `${ENG}/${id}.jpeg`, ...over });

describe("justification", () => {
  it("accepts a real explanation", () => expect(validateJustification("I am the sole photographer and no independent reviewer has been appointed.").ok).toBe(true));
  it.each([["", "empty"], ["too short", "short"], ["x".repeat(40), "one long word"], ["a a a a a a a a a a a a a a a a a a a a a a a a", "repetition"], ["short phrase only here", "under 30 chars"]])("rejects %j (%s)", (text) => {
    expect(validateJustification(text).ok).toBe(false);
  });
  it("counts trimmed length, so padding cannot satisfy it", () => expect(validateJustification("   " + "ab ".repeat(3) + "   ").ok).toBe(false));
});

describe("who can use the exception", () => {
  const base: ContextFacts = { viewerId: FOUNDER, engagementPayeeId: FOUNDER, founderProfileId: FOUNDER, holderActive: true, viewerIsLinkedLogin: false, linkedFounderIsPerformer: false, open: null };
  it("is available to the verified Founder who is the performer, with an active holder", () => expect(resolveFounderContext(base).state).toBe("available"));
  it("is open when an exception is open, listing the files already opened in the viewer", () => {
    const c = resolveFounderContext({ ...base, open: { id: "x1", openedAt: "t", expiresAt: "t2", justification: "j", viewedFileIds: ["f1"] } });
    expect(c.state === "open" && c.viewedFileIds).toEqual(["f1"]);
  });
  it("is unavailable (and says why) when the holder is missing, revoked or expired", () => {
    const c = resolveFounderContext({ ...base, holderActive: false });
    expect(c.state).toBe("unavailable");
  });
  it("never applies to another Super Admin", () => expect(resolveFounderContext({ ...base, viewerId: OTHER }).state).toBe("not_applicable"));
  it("never applies when there is no verified Founder identity", () => expect(resolveFounderContext({ ...base, founderProfileId: null }).state).toBe("not_applicable"));
  it("never applies on an engagement the Founder does not perform", () => expect(resolveFounderContext({ ...base, engagementPayeeId: OTHER }).state).toBe("not_applicable"));
  it("the second Founder-controlled login is blocked, with the reason, and cannot open or use the exception", () => {
    const c = resolveFounderContext({ ...base, viewerId: SECOND, viewerIsLinkedLogin: true, linkedFounderIsPerformer: true });
    expect(c).toEqual({ state: "linked_login", message: LINKED_LOGIN_MESSAGE });
  });
  it("a linked login is not told anything on engagements the Founder does not perform", () => {
    expect(resolveFounderContext({ ...base, viewerId: SECOND, viewerIsLinkedLogin: true, linkedFounderIsPerformer: false }).state).toBe("not_applicable");
  });
  it("the acknowledgement names the policy, the conflict and the second login", () => {
    expect(FSR_CONFLICT_ACKNOWLEDGEMENT).toContain("ORDIFT-POL-FSR-001");
    expect(FSR_CONFLICT_ACKNOWLEDGEMENT).toContain("performing professional");
    expect(FSR_CONFLICT_ACKNOWLEDGEMENT).toContain("second login is not an independent reviewer");
    expect(FSR_CONFLICT_ACKNOWLEDGEMENT.length).toBeGreaterThanOrEqual(40);
  });
});

describe("fixed selection for approval", () => {
  const files = [file("a"), file("b"), file("c"), file("raw", { fileKind: "source_raw" }), file("rel", { releaseStatus: "released" }), file("other", { engagementId: "eng-2" }), file("gone", { purged: true })];
  const ok = { engagementId: ENG, viewedFileIds: ["a", "b", "c"], note: "" };
  it("accepts viewed, submitted deliverables", () => expect(checkReviewSelection({ ...ok, files, decisions: { a: "approve", b: "approve" } }).ok).toBe(true));
  it("approve two and return one", () => expect(checkReviewSelection({ ...ok, files, decisions: { a: "approve", b: "approve", c: "request_changes" }, note: "Soften the retouching on the left." }).ok).toBe(true));
  it("requires every image to have been opened in the viewer", () => {
    const r = checkReviewSelection({ ...ok, viewedFileIds: ["a"], files, decisions: { a: "approve", b: "approve" } });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors[0]).toContain("open it in the review viewer first");
  });
  it("refuses RAW, released, purged and other-engagement files", () => {
    const r = checkReviewSelection({ ...ok, viewedFileIds: ["raw", "rel", "other", "gone"], files, decisions: { raw: "approve", rel: "approve", other: "approve", gone: "approve" } });
    expect(!r.ok && r.errors).toHaveLength(4);
  });
  it("a file added after the declaration is simply not in it", () => {
    const decl = { a: "approve" as const };
    const newer = [...files, file("added-later")];
    expect(Object.keys(decl)).not.toContain("added-later");
    expect(checkReviewSelection({ ...ok, files: newer, viewedFileIds: ["a"], decisions: decl }).ok).toBe(true);
    expect(checkReviewSelection({ ...ok, files: newer, viewedFileIds: ["a"], decisions: { ...decl, "added-later": "approve" } }).ok).toBe(false);
  });
  it("needs a note to return or decline, and an unknown id is an error", () => {
    expect(checkReviewSelection({ ...ok, files, decisions: { a: "reject" } }).ok).toBe(false);
    expect(checkReviewSelection({ ...ok, files, decisions: { nope: "approve" } }).ok).toBe(false);
  });
  it("rejects an empty or oversized selection", () => {
    expect(checkReviewSelection({ ...ok, files, decisions: {} }).ok).toBe(false);
    const many = Object.fromEntries(Array.from({ length: FSR_MAX_FILES_PER_DECLARATION + 1 }, (_, i) => [`x${i}`, "approve" as const]));
    expect(checkReviewSelection({ ...ok, files, decisions: many }).ok).toBe(false);
  });
  it("maps each decision to the resulting status", () => {
    expect([decisionToStatus("approve"), decisionToStatus("request_changes"), decisionToStatus("reject")]).toEqual(["approved", "changes_requested", "withdrawn"]);
  });
});

describe("fixed selection for release (separate declaration)", () => {
  const files = [file("a", { releaseStatus: "approved" }), file("b", { releaseStatus: "approved" }), file("s"), file("raw", { fileKind: "source_raw", releaseStatus: "approved" }), file("x", { engagementId: "eng-2", releaseStatus: "approved" })];
  it("accepts approved deliverables", () => expect(checkReleaseSelection({ files, engagementId: ENG, fileIds: ["a", "b"] }).ok).toBe(true));
  it("refuses unapproved, RAW, foreign and duplicate selections", () => {
    expect(checkReleaseSelection({ files, engagementId: ENG, fileIds: ["s"] }).ok).toBe(false);
    expect(checkReleaseSelection({ files, engagementId: ENG, fileIds: ["raw"] }).ok).toBe(false);
    expect(checkReleaseSelection({ files, engagementId: ENG, fileIds: ["x"] }).ok).toBe(false);
    expect(checkReleaseSelection({ files, engagementId: ENG, fileIds: ["a", "a"] }).ok).toBe(false);
    expect(checkReleaseSelection({ files, engagementId: ENG, fileIds: [] }).ok).toBe(false);
  });
  it("approving never makes a file releasable by itself: an unapproved file is not in the release set", () => {
    expect(checkReleaseSelection({ files: [file("s")], engagementId: ENG, fileIds: ["s"] }).ok).toBe(false);
  });
});

describe("snapshot and typed confirmation", () => {
  it("builds a deterministic snapshot from the server's own file data", () => {
    const f = [file("b"), file("a")].map((x) => ({ ...x, originalFilename: `${x.id}.jpeg`, releaseCategory: "final_gallery", clientTitle: `T ${x.id}`, mimeType: "image/jpeg" }));
    const s = buildSelectionSnapshot(f, ["b", "a"]);
    expect(s.map((x) => x.id)).toEqual(["a", "b"]);
    expect(s[0]).toMatchObject({ version: 1, size_bytes: 1000, storage_path: "eng-1/a.jpeg" });
    expect(() => buildSelectionSnapshot(f, ["missing"])).toThrow();
  });
  it("the typed count must equal the number of files exactly", () => {
    expect(validateTypedCount("3", 3)).toBe(true);
    expect(validateTypedCount(3, 3)).toBe(true);
    for (const bad of ["2", "", "three", "3.5", null, undefined]) expect(validateTypedCount(bad, 3)).toBe(false);
    expect(validateTypedCount(0, 0)).toBe(false);
  });
});

describe("truthful outcomes", () => {
  const ok = (id: string) => ({ fileId: id, label: id, ok: true });
  const bad = (id: string) => ({ fileId: id, label: id, ok: false, error: "changed" });
  it("completed only when every file was applied", () => expect(declarationOutcome("review", [ok("a"), ok("b")]).status).toBe("completed"));
  it("partial when some failed — and says so", () => {
    const r = declarationOutcome("release", [ok("a"), bad("b")]);
    expect(r.status).toBe("partial");
    expect(r.message).toContain("1 of 2");
  });
  it("failed when none applied — nothing changed", () => {
    const r = declarationOutcome("review", [bad("a")]);
    expect(r.status).toBe("failed");
    expect(r.message).toContain("nothing changed");
  });
  it("an empty result is pending, never completed", () => expect(declarationOutcome("review", []).status).toBe("pending"));
});
