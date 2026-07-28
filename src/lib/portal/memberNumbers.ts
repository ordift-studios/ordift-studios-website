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
