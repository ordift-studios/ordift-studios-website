import { beforeEach, describe, expect, it, vi } from "vitest";

// Batch submit, bulk review and the separate client-email follow-up, run against an in-memory database double.
// Real client files are never touched: this only exercises the library's rules.

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const writes: { table: string; patch: Row; id: unknown }[] = [];
const tableErrors: Record<string, { code: string; message: string }> = {};

function makeClient() {
  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    const rows = () => (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
      is: (c: string, v: unknown) => { filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return b; },
      in: (c: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[c])); return b; },
      update: (p: Row) => { patch = p; return b; },
      maybeSingle: () => Promise.resolve(tableErrors[table] ? { data: null, error: tableErrors[table] } : { data: rows()[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
        if (tableErrors[table]) return Promise.resolve({ data: null, error: tableErrors[table] }).then(ok, bad);
        const hit = rows();
        if (patch) {
          for (const r of hit) { Object.assign(r, patch); writes.push({ table, patch: patch!, id: r.id }); }
          return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(ok, bad);
        }
        return Promise.resolve({ data: hit, error: null }).then(ok, bad);
      },
    };
    return b;
  }
  return { from };
}

const mocks = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  logActivityAsSystem: vi.fn(async (_entry: { action: string; metadata?: { ok?: boolean; fileIds?: string[] } }) => undefined),
  getCrewAssignmentForEngagement: vi.fn(async (_e: string, userId: string) => (userId === "photographer" ? { state: "accepted" } : null)),
  isManagementUser: vi.fn(async () => true),
  sendFilesReadyEmail: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeClient() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/admin/activityLog", () => ({ logActivityAsSystem: mocks.logActivityAsSystem }));
vi.mock("@/lib/enquiry/lifecycleEmails", () => ({ sendFilesReadyEmail: mocks.sendFilesReadyEmail }));
vi.mock("@/lib/enquiry/pathways", () => ({ pathwayLabel: () => "Wedding" }));
vi.mock("./crewOffers", () => ({ getCrewAssignmentForEngagement: mocks.getCrewAssignmentForEngagement }));
vi.mock("./management", () => ({ isManagementUser: mocks.isManagementUser }));

import { listEmailedReleasedFileIds, notifyClientOfReleasedFiles, reviewFilesForRelease, submitPrivateFilesForRelease } from "./fileReleaseFlow";

const ENG = "eng-1";
const PHOTOGRAPHER = "photographer";
const REVIEWER = "independent-reviewer";
const user = (id: string) => ({ id }) as never;

function file(id: string, over: Row = {}): Row {
  return {
    id, engagement_id: ENG, file_kind: "deliverable", original_filename: `${id}.jpeg`, release_status: "submitted", release_category: "final_gallery",
    client_title: `Title ${id}`, client_description: null, purged_at: null, uploaded_by: PHOTOGRAPHER, submitted_for_release_by: PHOTOGRAPHER, ...over,
  };
}

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  for (const k of Object.keys(tableErrors)) delete tableErrors[k];
  writes.length = 0;
  db.engagements = [{ id: ENG, payee_profile_id: PHOTOGRAPHER, entity_type: "crew_support_slot", entity_id: "slot-1" }];
  db.crew_support_slots = [{ id: "slot-1", request_id: "req-1" }];
  db.crew_support_requests = [{ id: "req-1", enquiry_id: "enq-1" }];
  db.enquiries = [{ id: "enq-1", reference_number: "ENQ-1", is_test: false, full_name: "Client Name", email: "client@example.com", service: "wedding" }];
  db.activity_log = [];
  db.project_files = [];
  mocks.logActivityAsSystem.mockClear();
  mocks.sendFilesReadyEmail.mockClear();
  mocks.sendFilesReadyEmail.mockImplementation(async () => ({ ok: true }));
  mocks.isManagementUser.mockImplementation(async () => true);
});

describe("submitPrivateFilesForRelease — one pass for a whole gallery, safe to repeat", () => {
  it("submits every private categorised file with one audit entry each", async () => {
    db.project_files = Array.from({ length: 21 }, (_, i) => file(`p${i}`, { release_status: "private", client_title: null, original_filename: `Ben&Precious_HD-${i}.jpeg` }));
    const r = await submitPrivateFilesForRelease({ engagementId: ENG, actorUserId: PHOTOGRAPHER });
    expect(r.ok && r.submitted).toBe(21);
    expect(db.project_files.every((x) => x.release_status === "submitted" && x.submitted_for_release_by === PHOTOGRAPHER)).toBe(true);
    expect(mocks.logActivityAsSystem).toHaveBeenCalledTimes(21);
    expect(writes).toHaveLength(21);
  });
  it("a repeat after the first run (e.g. after a page refresh) changes nothing and reports the true state", async () => {
    db.project_files = Array.from({ length: 5 }, (_, i) => file(`p${i}`, { release_status: "private", client_title: null }));
    await submitPrivateFilesForRelease({ engagementId: ENG, actorUserId: PHOTOGRAPHER });
    writes.length = 0;
    mocks.logActivityAsSystem.mockClear();
    const again = await submitPrivateFilesForRelease({ engagementId: ENG, actorUserId: PHOTOGRAPHER });
    expect(again.ok && again.submitted).toBe(0);
    expect(again.ok && again.alreadyInReview).toBe(5);
    expect(writes).toHaveLength(0);
    expect(mocks.logActivityAsSystem).not.toHaveBeenCalled();
  });
  it("skips files without a category, purged files and files already approved or released", async () => {
    db.project_files = [file("a", { release_status: "private", release_category: null }), file("b", { release_status: "private", purged_at: "2026-10-01" }), file("c", { release_status: "approved" }), file("d", { release_status: "released" }), file("e", { release_status: "private" })];
    const r = await submitPrivateFilesForRelease({ engagementId: ENG, actorUserId: PHOTOGRAPHER });
    expect(r.ok && r.submitted).toBe(1);
    expect(r.ok && r.alreadyInReview).toBe(2);
    expect(db.project_files.find((x) => x.id === "a")?.release_status).toBe("private");
  });
  it("refuses anyone who is not the assigned professional, writing nothing", async () => {
    db.project_files = [file("a", { release_status: "private" })];
    const r = await submitPrivateFilesForRelease({ engagementId: ENG, actorUserId: REVIEWER });
    expect(r.ok).toBe(false);
    expect(writes).toHaveLength(0);
  });
});

describe("reviewFilesForRelease — per-file outcomes, separation of duties, deliverable-type files only", () => {
  beforeEach(() => {
    db.project_files = [file("a"), file("b"), file("c"), file("raw", { file_kind: "source_raw" }), file("rel", { release_status: "released" }), file("d", { uploaded_by: REVIEWER, submitted_for_release_by: REVIEWER })];
  });
  it("lets an independent reviewer approve two images and return one, each with its own outcome and audit entry", async () => {
    const approve = await reviewFilesForRelease({ fileIds: ["a", "b"], user: user("second-person"), action: "approve" });
    expect(approve.ok && approve.outcomes.every((o) => o.ok)).toBe(true);
    const rework = await reviewFilesForRelease({ fileIds: ["c"], user: user("second-person"), action: "request_changes", note: "Soften the skin retouching on the left." });
    expect(rework.ok && rework.outcomes[0].ok).toBe(true);
    expect(db.project_files.map((x) => [x.id, x.release_status])).toEqual(expect.arrayContaining([["a", "approved"], ["b", "approved"], ["c", "changes_requested"]]));
    expect(db.project_files.find((x) => x.id === "c")?.release_review_note).toBe("Soften the skin retouching on the left.");
    expect(db.project_files.find((x) => x.id === "a")?.release_reviewed_by).toBe("second-person");
    expect(mocks.logActivityAsSystem).toHaveBeenCalledTimes(3);
  });
  it("blocks the assigned photographer from reviewing their own files — every file refused, nothing written", async () => {
    const r = await reviewFilesForRelease({ fileIds: ["a", "b", "c"], user: user(PHOTOGRAPHER), action: "approve" });
    expect(r.ok && r.outcomes.every((o) => !o.ok)).toBe(true);
    expect(r.ok && r.outcomes[0].error).toMatch(/can't review or release your own work/);
    expect(writes).toHaveLength(0);
    expect(db.project_files.filter((x) => x.release_status === "approved")).toHaveLength(0);
  });
  it("reports a mixed selection honestly: RAW and released files are skipped, the rest succeed", async () => {
    const r = await reviewFilesForRelease({ fileIds: ["a", "raw", "rel", "b"], user: user("second-person"), action: "approve" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.outcomes.map((o) => [o.fileId, o.ok])).toEqual([["a", true], ["raw", false], ["rel", false], ["b", true]]);
    expect(db.project_files.find((x) => x.id === "raw")?.release_status).toBe("submitted");
    expect(db.project_files.find((x) => x.id === "rel")?.release_status).toBe("released");
  });
  it("requires a real note to return or decline, and writes nothing without one", async () => {
    const r = await reviewFilesForRelease({ fileIds: ["a"], user: user("second-person"), action: "request_changes", note: "no" });
    expect(r.ok).toBe(false);
    expect(writes).toHaveLength(0);
  });
  it("requires management authority and de-duplicates ids", async () => {
    mocks.isManagementUser.mockImplementation(async () => false);
    expect((await reviewFilesForRelease({ fileIds: ["a"], user: user("x"), action: "approve" })).ok).toBe(false);
    mocks.isManagementUser.mockImplementation(async () => true);
    const r = await reviewFilesForRelease({ fileIds: ["a", "a", "a"], user: user("second-person"), action: "approve" });
    expect(r.ok && r.outcomes).toHaveLength(1);
  });
  it("never marks anything released and never emails", async () => {
    await reviewFilesForRelease({ fileIds: ["a", "b"], user: user("second-person"), action: "approve" });
    expect(db.project_files.filter((x) => x.release_status === "released")).toHaveLength(1); // only the pre-existing one
    expect(mocks.sendFilesReadyEmail).not.toHaveBeenCalled();
  });
});

describe("notifyClientOfReleasedFiles — release and email are separate, and the email happens at most once per file", () => {
  beforeEach(() => {
    db.project_files = [file("r1", { release_status: "released" }), file("r2", { release_status: "released" }), file("s1")];
  });
  it("refuses files that are not released", async () => {
    const r = await notifyClientOfReleasedFiles({ fileIds: ["s1"], user: user("second-person") });
    expect(r.ok).toBe(false);
    expect(mocks.sendFilesReadyEmail).not.toHaveBeenCalled();
  });
  it("sends one email for the released files and records which files it covered", async () => {
    const r = await notifyClientOfReleasedFiles({ fileIds: ["r1", "r2"], user: user("second-person") });
    expect(r.ok).toBe(true);
    expect(mocks.sendFilesReadyEmail).toHaveBeenCalledTimes(1);
    const logged = mocks.logActivityAsSystem.mock.calls.find((c) => c[0].action === "deliverable.files_ready_email_sent");
    expect(logged?.[0].metadata).toMatchObject({ ok: true, fileIds: ["r1", "r2"] });
  });
  it("does not email again about files that already have a successful email", async () => {
    db.activity_log = [{ action: "deliverable.files_ready_email_sent", entity_id: "enq-1", metadata: { ok: true, fileIds: ["r1", "r2"] } }];
    const r = await notifyClientOfReleasedFiles({ fileIds: ["r1", "r2"], user: user("second-person") });
    expect(r).toEqual({ ok: false, error: "The client has already been emailed about these files." });
    expect(mocks.sendFilesReadyEmail).not.toHaveBeenCalled();
  });
  it("emails only about the files not yet covered", async () => {
    db.activity_log = [{ action: "deliverable.files_ready_email_sent", entity_id: "enq-1", metadata: { ok: true, fileIds: ["r1"] } }];
    const r = await notifyClientOfReleasedFiles({ fileIds: ["r1", "r2"], user: user("second-person") });
    expect(r.ok && r.emailed).toBe(1);
    expect(r.ok && r.alreadyEmailed).toBe(1);
  });
  it("a failed email is reported as failed, leaves the files released, and can be retried", async () => {
    mocks.sendFilesReadyEmail.mockImplementationOnce(async () => ({ ok: false }));
    const first = await notifyClientOfReleasedFiles({ fileIds: ["r1"], user: user("second-person") });
    expect(first.ok).toBe(false);
    expect(db.project_files.find((x) => x.id === "r1")?.release_status).toBe("released");
    db.activity_log = [{ action: "deliverable.files_ready_email_sent", entity_id: "enq-1", metadata: { ok: false, fileIds: ["r1"] } }];
    expect(await listEmailedReleasedFileIds("enq-1")).toEqual([]);
    expect((await notifyClientOfReleasedFiles({ fileIds: ["r1"], user: user("second-person") })).ok).toBe(true);
  });
  it("never emails for a test record or a client with no address", async () => {
    db.enquiries[0].is_test = true;
    expect((await notifyClientOfReleasedFiles({ fileIds: ["r1"], user: user("second-person") })).ok).toBe(false);
    db.enquiries[0].is_test = false;
    db.enquiries[0].email = null;
    expect((await notifyClientOfReleasedFiles({ fileIds: ["r1"], user: user("second-person") })).ok).toBe(false);
    expect(mocks.sendFilesReadyEmail).not.toHaveBeenCalled();
  });
});

describe("independence: a login under the Founder's common control is never an independent reviewer", () => {
  const FOUNDER = PHOTOGRAPHER;
  const SECOND = "second-login";
  beforeEach(() => {
    db.project_files = [file("a"), file("b")];
    db.founder_identities = [{ id: "fi-1", profile_id: FOUNDER, status: "active" }];
    db.founder_common_control_accounts = [{ id: "cc-1", founder_identity_id: "fi-1", profile_id: SECOND, revoked_at: null }];
  });
  it("the registered second login cannot review the Founder's files, even though it is a different profile", async () => {
    const r = await reviewFilesForRelease({ fileIds: ["a", "b"], user: user(SECOND), action: "approve" });
    expect(r.ok && r.outcomes.every((o) => !o.ok)).toBe(true);
    expect(r.ok && r.outcomes[0].error).toMatch(/common control/);
    expect(writes).toHaveLength(0);
  });
  it("an unrelated independent person is unaffected", async () => {
    const r = await reviewFilesForRelease({ fileIds: ["a"], user: user("second-person"), action: "approve" });
    expect(r.ok && r.outcomes[0].ok).toBe(true);
  });
  it("the Founder is still blocked from approving their own work through the normal path", async () => {
    const r = await reviewFilesForRelease({ fileIds: ["a"], user: user(FOUNDER), action: "approve" });
    expect(r.ok && r.outcomes[0].error).toMatch(/can't review or release your own work/);
  });
  it("a revoked link no longer blocks (the registration is what makes a login non-independent)", async () => {
    db.founder_common_control_accounts[0].revoked_at = "2026-10-22T00:00:00Z";
    db.founder_common_control_accounts = db.founder_common_control_accounts.filter((r) => r.revoked_at === null);
    const r = await reviewFilesForRelease({ fileIds: ["a"], user: user(SECOND), action: "approve" });
    expect(r.ok && r.outcomes[0].ok).toBe(true);
  });
  it("before the exception tables exist (migration not applied) normal reviews behave exactly as before", async () => {
    tableErrors.founder_identities = { code: "42P01", message: 'relation "public.founder_identities" does not exist' };
    tableErrors.founder_common_control_accounts = { code: "42P01", message: "does not exist" };
    const r = await reviewFilesForRelease({ fileIds: ["a"], user: user("second-person"), action: "approve" });
    expect(r.ok && r.outcomes[0].ok).toBe(true);
  });
  it("an unexpected error while checking independence fails CLOSED (the review is blocked, not allowed)", async () => {
    tableErrors.founder_identities = { code: "XX000", message: "connection reset" };
    const r = await reviewFilesForRelease({ fileIds: ["a"], user: user("second-person"), action: "approve" });
    expect(r.ok && r.outcomes[0].ok).toBe(false);
    expect(writes).toHaveLength(0);
  });
});

describe("independence survives revocation of the Founder identity (mirrors the database)", () => {
  it("the registered second login stays non-independent even when the Founder identity row is revoked", async () => {
    db.project_files = [file("a")];
    db.founder_identities = [{ id: "fi-1", profile_id: PHOTOGRAPHER, status: "revoked" }];
    db.founder_common_control_accounts = [{ id: "cc-1", founder_identity_id: "fi-1", profile_id: "second-login", revoked_at: null }];
    const r = await reviewFilesForRelease({ fileIds: ["a"], user: user("second-login"), action: "approve" });
    expect(r.ok && r.outcomes[0].error).toMatch(/common control/);
    expect(writes).toHaveLength(0);
  });
});

// The Founder's confirmed Production mapping (2026-10-22): the primary account (member 0001), TWO Founder-controlled logins, and one
// separate person (CT0001) who must stay an independent reviewer. Prefix labels only; real ids are resolved before any write.
describe("four-account mapping: two registered Founder-controlled logins are both non-independent; the separate person is not", () => {
  const PRIMARY = PHOTOGRAPHER; // 966bf3f7 - performer on the engagement
  const BACKUP = "second-login"; // 2bf593f7
  const ADDITIONAL = "additional-login"; // fb17e4c5
  const SEPARATE = "ct0001-separate-person"; // 14c51def - never registered
  beforeEach(() => {
    db.project_files = [file("a"), file("b")];
    db.founder_identities = [{ id: "fi-1", profile_id: PRIMARY, status: "active" }];
    db.founder_common_control_accounts = [
      { id: "cc-1", founder_identity_id: "fi-1", profile_id: BACKUP, revoked_at: null },
      { id: "cc-2", founder_identity_id: "fi-1", profile_id: ADDITIONAL, revoked_at: null },
    ];
  });
  it("each Founder-controlled login is refused as reviewer of the Founder's files, and nothing is written", async () => {
    for (const login of [BACKUP, ADDITIONAL]) {
      const r = await reviewFilesForRelease({ fileIds: ["a", "b"], user: user(login), action: "approve" });
      expect(r.ok && r.outcomes.every((o) => !o.ok)).toBe(true);
      expect(r.ok && r.outcomes[0].error).toMatch(/common control/);
    }
    expect(writes).toHaveLength(0);
  });
  it("the separate person (CT0001, not registered) remains an independent reviewer", async () => {
    const r = await reviewFilesForRelease({ fileIds: ["a"], user: user(SEPARATE), action: "approve" });
    expect(r.ok && r.outcomes[0].ok).toBe(true);
  });
  it("it also works in the other direction: work performed by one controlled login cannot be reviewed by the other", async () => {
    db.project_files = [file("c", { uploaded_by: ADDITIONAL, submitted_for_release_by: ADDITIONAL })];
    const r = await reviewFilesForRelease({ fileIds: ["c"], user: user(BACKUP), action: "approve" });
    expect(r.ok && r.outcomes[0].error).toMatch(/common control/);
    const ok = await reviewFilesForRelease({ fileIds: ["c"], user: user(SEPARATE), action: "approve" });
    expect(ok.ok && ok.outcomes[0].ok).toBe(true);
  });
  it("revoking ONE registration frees only that login; the other stays non-independent", async () => {
    db.founder_common_control_accounts = db.founder_common_control_accounts.filter((x) => x.profile_id !== ADDITIONAL);
    const stillBlocked = await reviewFilesForRelease({ fileIds: ["a"], user: user(BACKUP), action: "approve" });
    expect(stillBlocked.ok && stillBlocked.outcomes[0].error).toMatch(/common control/);
    const freed = await reviewFilesForRelease({ fileIds: ["b"], user: user(ADDITIONAL), action: "approve" });
    expect(freed.ok && freed.outcomes[0].ok).toBe(true);
  });
  it("both stay non-independent even if the Founder identity row is revoked", async () => {
    db.founder_identities[0].status = "revoked";
    for (const login of [BACKUP, ADDITIONAL]) {
      const r = await reviewFilesForRelease({ fileIds: ["a"], user: user(login), action: "approve" });
      expect(r.ok && r.outcomes[0].error).toMatch(/common control/);
    }
  });
  it("registering links changes no one's review permission outside the Founder's own work (management check is untouched)", async () => {
    const r = await reviewFilesForRelease({ fileIds: ["a"], user: user(SEPARATE), action: "approve" });
    expect(mocks.isManagementUser).toHaveBeenCalled();
    expect(r.ok && r.outcomes[0].ok).toBe(true);
  });
});

describe("re-designating the Founder identity does not release the registered logins (mirrors private.fsr_group)", () => {
  it("both logins registered against the OLD identity row stay non-independent after the Founder is designated again", async () => {
    db.project_files = [file("a")];
    db.founder_identities = [
      { id: "fi-old", profile_id: PHOTOGRAPHER, status: "revoked" },
      { id: "fi-new", profile_id: PHOTOGRAPHER, status: "active" },
    ];
    db.founder_common_control_accounts = [
      { id: "cc-1", founder_identity_id: "fi-old", profile_id: "second-login", revoked_at: null },
      { id: "cc-2", founder_identity_id: "fi-old", profile_id: "additional-login", revoked_at: null },
    ];
    for (const login of ["second-login", "additional-login"]) {
      const r = await reviewFilesForRelease({ fileIds: ["a"], user: user(login), action: "approve" });
      expect(r.ok && r.outcomes[0].error).toMatch(/common control/);
    }
    expect(writes).toHaveLength(0);
    // a person who was never registered is still independent
    const ok = await reviewFilesForRelease({ fileIds: ["a"], user: user("ct0001-separate-person"), action: "approve" });
    expect(ok.ok && ok.outcomes[0].ok).toBe(true);
  });
});
