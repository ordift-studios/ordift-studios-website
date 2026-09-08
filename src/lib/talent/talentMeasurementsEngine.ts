import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, TALENT_CAPABILITIES } from "@/lib/organization/authority";

// Ordift Talent — TALENT-SYS-2B, Phase 1 (2026-09-08). DB-backed Info-
// tab measurements layer. Gated by the DORMANT
// talent.profile.administer capability for writes; reads are covered
// by talent_measurements' own RLS (admin or the talent's own row —
// migration 0073), so no read function here needs its own gate.

async function requireProfileAdminister(actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, TALENT_CAPABILITIES.profileAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to administer talent measurements." };
  return { ok: true };
}

export type TalentMeasurementsInput = {
  heightCm?: number | null;
  bustCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  shoeEu?: number | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  languages?: string[];
  travelReady?: boolean | null;
  location?: string | null;
};

export async function setTalentMeasurements(params: TalentMeasurementsInput & { profileId: string; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireProfileAdminister(params.actorUserId);
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { error } = await admin.from("talent_measurements").upsert(
    {
      id: params.profileId,
      height_cm: params.heightCm ?? null,
      bust_cm: params.bustCm ?? null,
      waist_cm: params.waistCm ?? null,
      hip_cm: params.hipCm ?? null,
      shoe_eu: params.shoeEu ?? null,
      hair_color: params.hairColor ?? null,
      eye_color: params.eyeColor ?? null,
      languages: params.languages ?? [],
      travel_ready: params.travelReady ?? null,
      location: params.location ?? null,
      updated_at: new Date().toISOString(),
      updated_by: params.actorUserId,
    },
    { onConflict: "id" },
  );
  if (error) {
    console.error("[talent] failed to set talent measurements", error.message);
    return { ok: false, error: "Failed to save measurements." };
  }

  await logActivity({ actorUserId: params.actorUserId, action: "talent.measurements.set", entityType: "model_profile", entityId: params.profileId, metadata: {} });
  return { ok: true };
}

export type TalentMeasurements = {
  heightCm: number | null;
  bustCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
  shoeEu: number | null;
  hairColor: string | null;
  eyeColor: string | null;
  languages: string[];
  travelReady: boolean | null;
  location: string | null;
};

export async function getTalentMeasurements(profileId: string): Promise<TalentMeasurements | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("talent_measurements").select("*").eq("id", profileId).maybeSingle();
  if (!data) return null;
  return {
    heightCm: data.height_cm,
    bustCm: data.bust_cm,
    waistCm: data.waist_cm,
    hipCm: data.hip_cm,
    shoeEu: data.shoe_eu,
    hairColor: data.hair_color,
    eyeColor: data.eye_color,
    languages: data.languages ?? [],
    travelReady: data.travel_ready,
    location: data.location,
  };
}
