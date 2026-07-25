import { createClient } from "@/lib/supabase/server";
import { contentRepository } from "@/lib/content";

export type OverviewStats = {
  newEnquiriesThisWeek: number;
  openWorkshopsCount: number;
  pendingModelApplications: number;
  pendingVendorApplications: number;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// One query per stat rather than a single aggregate RPC — these are cheap
// count-only requests (head: true means Postgres never materializes rows),
// and keeping them separate means one failing table can't blank out the
// whole dashboard.
export async function getOverviewStats(): Promise<OverviewStats> {
  const supabase = await createClient();
  const sinceIso = new Date(Date.now() - WEEK_MS).toISOString();

  const [enquiriesResult, modelResult, vendorResult, workshops] = await Promise.all([
    supabase
      .from("enquiries")
      .select("id", { count: "exact", head: true })
      .gte("submitted_at", sinceIso),
    supabase
      .from("model_profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("vendor_profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    contentRepository.getWorkshops(),
  ]);

  if (enquiriesResult.error) {
    console.error("[admin] overview: enquiries count failed", enquiriesResult.error.message);
  }
  if (modelResult.error) {
    console.error("[admin] overview: model_profiles count failed", modelResult.error.message);
  }
  if (vendorResult.error) {
    console.error("[admin] overview: vendor_profiles count failed", vendorResult.error.message);
  }

  return {
    newEnquiriesThisWeek: enquiriesResult.count ?? 0,
    openWorkshopsCount: workshops.filter((w) => w.status === "open").length,
    pendingModelApplications: modelResult.count ?? 0,
    pendingVendorApplications: vendorResult.count ?? 0,
  };
}
