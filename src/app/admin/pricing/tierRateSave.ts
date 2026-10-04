import type { ServiceMode, WeddingEventCategory } from "@/lib/pricing/weddingEventEstimate";

export type TierRateSaveState = { ok: true; message: string } | { ok: false; error: string } | null;

type SaveParams = { marketSlug: string; category: WeddingEventCategory; serviceMode: ServiceMode; tierSlug: string; priceUsd: number; actorUserId: string };
type SaveResult = { ok: true; unchanged?: boolean } | { ok: false; error: string };

// Success is only ever reported after the append-only write actually
// returns ok — never optimistically. revalidate() runs only on a real
// success (including an unchanged no-op, where nothing needs refreshing
// but the message still has to be truthful).
export async function saveTierRate(
  formData: FormData,
  userId: string | null,
  save: (params: SaveParams) => Promise<SaveResult>,
  revalidate: () => void
): Promise<TierRateSaveState> {
  if (!userId) return { ok: false, error: "You must be signed in to save a rate." };

  const marketSlug = String(formData.get("marketSlug") ?? "");
  const category = String(formData.get("category") ?? "");
  const serviceMode = String(formData.get("serviceMode") ?? "");
  const tierSlug = String(formData.get("tierSlug") ?? "");
  const priceUsd = Number(formData.get("priceUsd"));
  if (!marketSlug || (category !== "wedding" && category !== "event") || !tierSlug || !Number.isFinite(priceUsd) || priceUsd <= 0) {
    return { ok: false, error: "Enter a valid price greater than zero." };
  }

  let result: SaveResult;
  try {
    result = await save({ marketSlug, category, serviceMode: serviceMode as ServiceMode, tierSlug, priceUsd, actorUserId: userId });
  } catch (error) {
    console.error("[admin] failed to save wedding/event tier rate", error);
    return { ok: false, error: "Could not save the rate. Please try again." };
  }
  if (!result.ok) return { ok: false, error: result.error };

  revalidate();
  const price = `$${priceUsd.toFixed(2)}`;
  return { ok: true, message: result.unchanged ? `No change — the active rate is already ${price}.` : `Saved — new version active at ${price}.` };
}
