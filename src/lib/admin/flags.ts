import { createClient } from "@/lib/supabase/server";

export type FeatureFlag = {
  id: string;
  key: string;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
};

export async function getFeatureFlags(): Promise<FeatureFlag[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feature_flags")
    .select("id, key, enabled, description, updated_at")
    .order("key", { ascending: true });

  if (error) {
    console.error("[admin] failed to load feature_flags", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    key: row.key,
    enabled: row.enabled,
    description: row.description,
    updatedAt: row.updated_at,
  }));
}
