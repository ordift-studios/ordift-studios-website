import { createClient } from "@/lib/supabase/server";

export type DeliverableEntityType = "enquiry" | "workshop_registration";

export type DeliverableCategory = {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
};

export async function getDeliverableCategories(): Promise<DeliverableCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deliverable_categories")
    .select("id, key, label, sort_order")
    .order("sort_order");

  if (error) {
    console.error("[admin] failed to load deliverable_categories", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    key: row.key,
    label: row.label,
    sortOrder: row.sort_order,
  }));
}

export type AdminDeliverable = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  thumbnailUrl: string | null;
  categoryId: string;
  categoryLabel: string;
  publishedByName: string | null;
  publishedAt: string;
};

export async function getDeliverablesForEntity(
  entityType: DeliverableEntityType,
  entityId: string
): Promise<AdminDeliverable[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deliverables")
    .select(
      "id, title, description, url, thumbnail_url, category_id, published_at, deliverable_categories(label), profiles(full_name)"
    )
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("published_at", { ascending: false });

  if (error) {
    console.error("[admin] failed to load deliverables", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    url: row.url,
    thumbnailUrl: row.thumbnail_url,
    categoryId: row.category_id,
    categoryLabel:
      (row.deliverable_categories as unknown as { label: string } | null)?.label ?? "Uncategorized",
    publishedByName: (row.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
    publishedAt: row.published_at,
  }));
}
