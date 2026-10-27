"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { approveEdition, createDraft, getApprovedEditionForDownload, startNextEdition, updateDraft } from "@/lib/pdf/rateCard/editions";
import { buildDraftFromSellingRates } from "@/lib/pdf/rateCard/loaders";
import { getContractingEntityStanding } from "@/lib/organization/entityRegistrations";
import { checkBinding, currencyOptionsFor } from "@/lib/pdf/rateCard/jurisdictions";
import type { RateCardContent } from "@/lib/pdf/rateCard/types";

// Rate card editions: Super Admin only. Every action re-checks the role and every rule is applied again inside the edition module; nothing here publishes or sends anything.
type Res<T> = ({ ok: true } & T) | { ok: false; error: string };
const today = () => new Date().toISOString().slice(0, 10);
async function actor(): Promise<{ id: string } | { error: string }> {
  const u = await getCurrentUser();
  if (!u) return { error: "Not signed in." };
  if (!isSuperAdmin(u)) return { error: "Only Super Admin may manage rate card editions." };
  return { id: u.id };
}
const ALL = ["photography", "videography", "graphic_design", "talent_management", "production_services", "drone_operations"];

export async function buildDraftAction(input: { marketSlug: string; entityId: string; currency: string }): Promise<Res<{ content: RateCardContent }>> {
  const a = await actor(); if ("error" in a) return { ok: false, error: a.error };
  if (!currencyOptionsFor(input.marketSlug).includes(input.currency)) return { ok: false, error: checkBinding({ marketSlug: input.marketSlug, currency: input.currency, hasEntity: false })[0] ?? "That currency is not available for this market." };
  const r = await buildDraftFromSellingRates({ marketSlug: input.marketSlug, entityId: input.entityId || undefined, today: today(), currency: input.currency });
  return r.ok ? { ok: true, content: r.draft } : r;
}
export async function saveNewDraftAction(content: RateCardContent): Promise<Res<{ id: string }>> {
  const a = await actor(); if ("error" in a) return { ok: false, error: a.error };
  const r = await createDraft({ actorUserId: a.id, content }); if (r.ok) revalidatePath("/admin/pricing/rate-card"); return r;
}
export async function updateDraftAction(id: string, content: RateCardContent, expectedUpdatedAt: string): Promise<Res<{ updatedAt: string }>> {
  const a = await actor(); if ("error" in a) return { ok: false, error: a.error };
  return updateDraft({ actorUserId: a.id, id, content, expectedUpdatedAt });
}
export async function approveEditionAction(id: string, marketSlug: string, entityId: string | null, clearanceStatement: string): Promise<Res<{ contentSha256: string }>> {
  const a = await actor(); if ("error" in a) return { ok: false, error: a.error };
  const r = await approveEdition({
    actorUserId: a.id, id, clearanceStatement, today: today(),
    deps: {
      currentUsd: async () => { const c = await buildDraftFromSellingRates({ marketSlug, today: today() }); return c.ok ? c.draft : null; },
      licensed: async () => {
        if (!entityId) return null;
        const st = await getContractingEntityStanding(entityId, today(), ALL); if (!st) return null;
        return { entityId, entityName: st.entity.legal_name ?? st.entity.name, checkedOn: today(), keys: st.assessment.activities.filter((x) => x.state === "licensed" || x.state === "listed_on_registration").map((x) => x.key) };
      },
    },
  });
  if (r.ok) revalidatePath("/admin/pricing/rate-card");
  return r.ok ? { ok: true, contentSha256: r.contentSha256 } : r;
}
export async function startNextEditionAction(fromId: string, editionLabel: string, effectiveDate: string): Promise<Res<{ id: string }>> {
  const a = await actor(); if ("error" in a) return { ok: false, error: a.error };
  const r = await startNextEdition({ actorUserId: a.id, fromId, editionLabel, effectiveDate }); if (r.ok) revalidatePath("/admin/pricing/rate-card"); return r;
}
// Releases the frozen content of an APPROVED edition for the browser to render without the draft watermark; verified against its hash and audited on the server.
export async function downloadApprovedAction(id: string): Promise<Res<{ content: RateCardContent; editionId: string; contentSha256: string; approvedBy: string; approvedAt: string }>> {
  const a = await actor(); if ("error" in a) return { ok: false, error: a.error };
  const r = await getApprovedEditionForDownload({ actorUserId: a.id, id }); if (!r.ok) return r;
  return { ok: true, content: r.edition.content, editionId: r.edition.id, contentSha256: r.edition.contentSha256 as string, approvedBy: r.edition.approvedBy ?? "", approvedAt: r.edition.approvedAt ?? "" };
}
