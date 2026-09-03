import { describe, expect, it } from "vitest";
import { validateCreatePayeeProfileInput } from "@/app/admin/payables/actions";
import { mapCreatePayeeProfileError } from "@/lib/payables/payeeProfiles";

// Mutation feedback fix (2026-09-04) — tests for the Add Payee defect
// investigated on real Production (see the accompanying report). What
// follows covers exactly what is genuinely unit-testable in this
// codebase's current test tier:
//
//   - failed creation (missing input) — validateCreatePayeeProfileInput()
//   - existing duplicate protection — mapCreatePayeeProfileError()
//
// What is NOT covered here, and why: pending state, disabled-while-
// pending double-submit protection, and error-message rendering are
// React component behavior (useFormStatus()/useActionState() inside
// AddPayeeForm.tsx) — this project's vitest.config.ts documents,
// deliberately, that jsdom/@testing-library/react are not installed
// yet (a real, pre-existing toolchain conflict noted there, not
// something introduced by this fix). Successful creation and the
// post-success redirect/refresh are a live-database concern; unlike
// most of this codebase's DB-dependent modules, payee_profiles has no
// Staging counterpart to run an .integration.test.ts against (the
// Universal Payables System is Production-only by explicit design —
// migration 0049 was never applied to Staging), so that tier is
// verified instead by read-only Production smoke checks after deploy,
// consistent with how this fix's redirect() design turns "did the list
// refresh" into a framework-level navigation guarantee rather than
// something requiring bespoke test infrastructure.

describe("validateCreatePayeeProfileInput", () => {
  it("rejects a missing account selection", () => {
    const result = validateCreatePayeeProfileInput({ profileId: "", category: "vendor" });
    expect(result).toEqual({ ok: false, error: "Select an existing account first." });
  });

  it("rejects a missing category", () => {
    const result = validateCreatePayeeProfileInput({ profileId: "11111111-1111-1111-1111-111111111111", category: "" });
    expect(result).toEqual({ ok: false, error: "Select a category." });
  });

  it("rejects both missing at once, reporting the account first", () => {
    const result = validateCreatePayeeProfileInput({ profileId: "", category: "" });
    expect(result).toEqual({ ok: false, error: "Select an existing account first." });
  });

  it("accepts a valid submission", () => {
    const result = validateCreatePayeeProfileInput({ profileId: "11111111-1111-1111-1111-111111111111", category: "vendor" });
    expect(result).toEqual({ ok: true });
  });
});

describe("mapCreatePayeeProfileError — existing duplicate protection", () => {
  it("maps a Postgres unique-violation (23505) to an actionable duplicate message", () => {
    expect(mapCreatePayeeProfileError("23505")).toBe("This person is already classified as a payee.");
  });

  it("maps any other error code to a generic failure message, not the raw DB error", () => {
    expect(mapCreatePayeeProfileError("23503")).toBe("Failed to create the payee profile.");
    expect(mapCreatePayeeProfileError(undefined)).toBe("Failed to create the payee profile.");
  });
});
