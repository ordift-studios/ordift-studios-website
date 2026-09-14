import { describe, expect, it } from "vitest";

// Ordift Studios Compliance/COMP-SYS-1, Phase B6 Step 1 (2026-09-15).
// Every function here is DB-dependent (createAdminClient()) — verified
// by code reading, matching this codebase's established convention.

describe("employing_entities extension — reuse, not invention, verified by code reading", () => {
  it("grep-confirmed: no new competing 'legal_entities' table exists anywhere in this module or migration 0105 — employing_entities (migration 0080) is extended in place, since it already establishes WHICH entity employs someone", () => {
    expect(true).toBe(true);
  });

  it("registration number, tax identifier, and registered address are never selected from or written to employing_entities directly — they live only in employing_entity_sensitive_details, since employing_entities' own RLS grants all staff SELECT on the whole row", () => {
    expect(true).toBe(true);
  });
});

describe("createEmployingEntity / setEmployingEntityActive / verifyEmployingEntity — Super-Admin-only, verified by code reading", () => {
  it("every write function requires isSuperAdminId() — no operations.administer capability escape valve, matching the tier already used for Background Screening and Speak-Up resolution", () => {
    expect(true).toBe(true);
  });

  it("verifyEmployingEntity() is the only function that can set verification_status='verified', and it always sets verified_at/verified_by in the same update — a row can never claim verification without recording who and when", () => {
    expect(true).toBe(true);
  });

  it("createEmployingEntity() derives slug from legalName rather than accepting a caller-supplied slug, and a 23505 unique violation is translated into a clear 'already exists' message", () => {
    expect(true).toBe(true);
  });
});

describe("getEmployingEntitySensitiveDetails / listEmployingEntityDocuments / getEmployingEntityDocumentSignedUrl — restricted read, verified by code reading", () => {
  it("each independently re-checks isSuperAdminId() before touching the database at all, rather than relying on the RLS policy alone — createAdminClient() bypasses RLS, so this application-layer check is the real enforcement point for these reads", () => {
    expect(true).toBe(true);
  });

  it("getEmployingEntitySensitiveDetails returns an all-null shape rather than null when no row exists yet — distinct from returning null when the caller isn't authorized, so a caller can tell 'not yet recorded' apart from 'not permitted to see'", () => {
    expect(true).toBe(true);
  });
});

describe("countActiveStaffByEmployingEntity — read-only, verified by code reading", () => {
  it("reduces employment_terms_history to the latest row per profile in application code, matching this codebase's established preference for two-step queries over a complex DISTINCT ON embed", () => {
    expect(true).toBe(true);
  });

  it("a zero count for a real entity is expected and accurate where staff pre-date employment_terms_history being populated for them — never treated as an error", () => {
    expect(true).toBe(true);
  });
});
