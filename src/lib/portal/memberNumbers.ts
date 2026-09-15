import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";

// Backs the platform-wide Member Number system (migration 0019),
// replacing the flat staff-only Staff Number (0017). See that
// migration's header for the full design rationale — the summary:
// classification is an explicit, admin-assigned field (never derived
// from Role/Engagement Type/Operational Title), each classification
// has its own independent, never-resetting sequence, and a person's
// number changes only when their classification changes — the old
// number is archived, never deleted or reused.
//
// Every write here uses the service-role client and is meant to be
// called from a Super-Admin-gated server action, never directly from
// an authenticated user's own session — RLS on member_numbers has no
// insert/update policy for `authenticated` at all, by design.

export type MemberClassification = {
  id: string;
  slug: string;
  name: string;
  prefix: string;
  numberPadding: number;
  startingNumber: number;
  active: boolean;
  sortOrder: number;
};

function mapClassification(row: {
  id: string;
  slug: string;
  name: string;
  prefix: string;
  number_padding: number;
  starting_number: number;
  active: boolean;
  sort_order: number;
}): MemberClassification {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    prefix: row.prefix,
    numberPadding: row.number_padding,
    startingNumber: row.starting_number,
    active: row.active,
    sortOrder: row.sort_order,
  };
}

export async function listClassifications(includeInactive = false): Promise<MemberClassification[]> {
  const admin = createAdminClient();
  let query = admin
    .from("member_number_classifications")
    .select("id, slug, name, prefix, number_padding, starting_number, active, sort_order")
    .order("sort_order");
  if (!includeInactive) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) {
    console.error("[memberNumbers] failed to load classifications", error.message);
    return [];
  }
  return (data ?? []).map(mapClassification);
}

// Internal sequence key — namespaced and keyed by the classification's
// stable slug, not its (editable) display prefix, so renaming a
// classification's prefix later never affects its running counter.
function sequenceKey(slug: string): string {
  return `member:${slug}`;
}

async function formatNextNumber(
  admin: ReturnType<typeof createAdminClient>,
  classification: MemberClassification
): Promise<{ formatted: string; sequenceValue: number } | { error: string }> {
  const key = sequenceKey(classification.slug);

  // Only takes effect the first time this classification is ever used
  // (ON CONFLICT DO NOTHING in seed_record_sequence) — safe to call on
  // every assignment, not just the first.
  if (classification.startingNumber > 1) {
    const { error: seedError } = await admin.rpc("seed_record_sequence", {
      p_prefix: key,
      p_year: 0,
      p_start_at: classification.startingNumber,
    });
    if (seedError) {
      console.error("[memberNumbers] seed_record_sequence failed", seedError.message);
    }
  }

  const { data, error } = await admin.rpc("next_record_sequence", { p_prefix: key, p_year: 0 });
  if (error) {
    return { error: error.message };
  }

  const sequenceValue = data as number;
  const padded = String(sequenceValue).padStart(classification.numberPadding, "0");
  return { formatted: `${classification.prefix}${padded}`, sequenceValue };
}

export type AssignClassificationResult =
  | { ok: true; formattedNumber: string; changed: boolean }
  | { ok: false; error: string };

// Idempotent: if the profile's current active classification already
// matches classificationId, this is a no-op that returns the existing
// number (changed: false) — reclassifying someone to the classification
// they're already in must never generate a new number.
export async function assignClassification(
  profileId: string,
  classificationId: string,
  actorUserId: string | null
): Promise<AssignClassificationResult> {
  const admin = createAdminClient();

  const { data: classificationRow, error: classificationError } = await admin
    .from("member_number_classifications")
    .select("id, slug, name, prefix, number_padding, starting_number, active, sort_order")
    .eq("id", classificationId)
    .maybeSingle();
  if (classificationError || !classificationRow) {
    return { ok: false, error: "Classification not found." };
  }
  const classification = mapClassification(classificationRow);
  if (!classification.active) {
    return { ok: false, error: "This classification is disabled — no new numbers can be assigned under it." };
  }

  const { data: currentActive } = await admin
    .from("member_numbers")
    .select("id, classification_id, formatted_number")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .maybeSingle();

  if (currentActive?.classification_id === classificationId) {
    return { ok: true, formattedNumber: currentActive.formatted_number, changed: false };
  }

  if (currentActive) {
    const { error: archiveError } = await admin
      .from("member_numbers")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("id", currentActive.id);
    if (archiveError) {
      console.error("[memberNumbers] failed to archive previous number", archiveError.message);
      return { ok: false, error: "Failed to archive the previous number." };
    }
  }

  const generated = await formatNextNumber(admin, classification);
  if ("error" in generated) {
    return { ok: false, error: `Failed to generate a number: ${generated.error}` };
  }

  const { error: insertError } = await admin.from("member_numbers").insert({
    profile_id: profileId,
    classification_id: classificationId,
    formatted_number: generated.formatted,
    sequence_value: generated.sequenceValue,
    status: "active",
  });
  if (insertError) {
    // Race safety (member_numbers_one_active_per_profile, migration
    // 0019): two concurrent callers can both pass the currentActive
    // check above and both attempt to insert. The loser hits this
    // unique violation — that is a genuine "already assigned"
    // outcome, not a failure, so resolve it the same way the idempotent
    // early-return above does, rather than surfacing a spurious error.
    if (insertError.code === "23505") {
      const { data: winner } = await admin
        .from("member_numbers")
        .select("formatted_number")
        .eq("profile_id", profileId)
        .eq("status", "active")
        .maybeSingle();
      if (winner) return { ok: true, formattedNumber: winner.formatted_number, changed: false };
    }
    console.error("[memberNumbers] failed to insert new active number", insertError.message);
    return { ok: false, error: "Failed to record the new number." };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ member_number: generated.formatted })
    .eq("id", profileId);
  if (profileError) {
    console.error("[memberNumbers] failed to sync profiles.member_number cache", profileError.message);
  }

  if (actorUserId) {
    await logActivity({
      actorUserId,
      action: "member_number.assign",
      entityType: "user",
      entityId: profileId,
      metadata: { classificationId, memberNumber: generated.formatted },
    });
  }

  return { ok: true, formattedNumber: generated.formatted, changed: true };
}

// Convenience wrapper for the two auto-assignment call sites (public
// signup, admin invite) — looks up a classification by its stable slug
// rather than requiring the caller to know its id. Silently no-ops if
// the slug doesn't exist or is disabled, so a misconfigured/renamed
// classification can never break signup — same "best-effort, never
// blocks the primary action" posture as the role-grant helpers in
// src/lib/supabase/primaryWrite.ts.
export async function assignClassificationBySlug(profileId: string, slug: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("member_number_classifications")
    .select("id, active")
    .eq("slug", slug)
    .maybeSingle();
  if (!data || !data.active) return;

  const result = await assignClassification(profileId, data.id, null);
  if (!result.ok) {
    console.error(`[memberNumbers] auto-assign "${slug}" failed for ${profileId}`, result.error);
  }
}

// Staff-number controlled lifecycle (Workforce/Employee Self-Service
// Phase, Founder decision 2026-09-15) — called from
// advanceOnboardingStage() (src/lib/organization/onboarding.ts) once an
// employee-pipeline onboarding reaches or has passed "approved_for_hire".
// Deliberately conservative: if the profile ALREADY has any active
// member number (under any classification — e.g. a former client or
// contractor being converted to staff), this does nothing and leaves
// that number exactly as-is. Silently reclassifying someone as a side
// effect of an onboarding stage advance would be a surprising, invisible
// change; a genuine reclassification remains the existing deliberate
// admin action (assignClassification via Users & Roles / the profile
// page), never automatic. This function only ever fills a genuinely
// empty slot — it never overwrites, never reuses an archived number
// (member_numbers is insert/archive-only, migration 0019), and is
// idempotent + race-safe through assignClassification's own guards.
export async function assignPermanentStaffNumberIfEligible(
  profileId: string,
  actorUserId: string | null
): Promise<AssignClassificationResult> {
  const admin = createAdminClient();
  const { data: currentActive } = await admin
    .from("member_numbers")
    .select("formatted_number")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .maybeSingle();
  if (currentActive) {
    return { ok: true, formattedNumber: currentActive.formatted_number, changed: false };
  }

  const { data: classificationRow } = await admin
    .from("member_number_classifications")
    .select("id")
    .eq("slug", "permanent_staff")
    .maybeSingle();
  if (!classificationRow) {
    return { ok: false, error: "The 'permanent_staff' classification is not configured — CONFIGURATION REQUIRED before staff numbers can be auto-issued." };
  }

  return assignClassification(profileId, classificationRow.id, actorUserId);
}
