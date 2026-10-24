"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExchangeRateHistory } from "@/lib/payments/currency";
import { indicativeLocalAmount } from "@/lib/pricing/indicativeLocal";
import { saveCommunicatedPrice } from "@/lib/enquiry/pricingPersistence";

export type SaveState = { ok: boolean; message: string } | null;

// Saves what the client was told. The figures come from the estimator results captured in the browser (there is no second pricing engine to re-run them on the
// server), so the record says exactly that; the staff member and time are stored with it. The price stays in USD; an optional QAR/GHS figure is recomputed HERE
// from the governed exchange-rate table and is stored only as a clearly labelled internal reference.
export async function saveWorkspacePriceAction(p: { enquiryReference: string; service: string; title: string; lines: string[]; totalUsd: number; channel: string; communicatedAt: string; localCurrency: "" | "QAR" | "GHS"; assumptions: string; notes: string }): Promise<SaveState> {
  const user = await getCurrentUser(); if (!user) return { ok: false, message: "Please sign in again." };
  const admin = createAdminClient();
  const { data: enq } = await admin.from("enquiries").select("id").eq("reference_number", p.enquiryReference.trim().toUpperCase()).maybeSingle();
  if (!enq) return { ok: false, message: "No enquiry has that reference." };
  let indicativeLocal = null;
  if (p.localCurrency) {
    const rate = (await getExchangeRateHistory(p.localCurrency)).find((r) => new Date(r.effectiveFrom).getTime() <= Date.now());
    const l = indicativeLocalAmount(p.totalUsd, p.localCurrency, rate ? { rateToUsd: Number(rate.rateToUsd), effectiveFrom: rate.effectiveFrom } : null);
    if (l.ok) indicativeLocal = { currency: p.localCurrency, amount: l.amount, rateToUsd: l.rateToUsd, effectiveFrom: l.effectiveFrom };
  }
  const r = await saveCommunicatedPrice(user, {
    enquiryId: enq.id as string, service: p.service, scopeTitle: p.title, scopeLines: p.lines.slice(0, 20).map((l) => String(l).slice(0, 200)), baseTotalUsd: p.totalUsd, communicatedUsd: p.totalUsd,
    channel: p.channel, communicatedAt: p.communicatedAt || new Date().toISOString(), assumptions: p.assumptions, notes: p.notes, indicativeLocal,
    pricingSnapshot: { source: "governed estimator result captured in the browser", capturedBy: user.id, capturedAt: new Date().toISOString(), summaryTitle: p.title, summaryLines: p.lines.slice(0, 20) },
  });
  if (!r.ok) return { ok: false, message: r.error };
  revalidatePath(`/admin/enquiries/${enq.id}`);
  return { ok: true, message: `Saved as revision ${r.revision} on ${p.enquiryReference.trim().toUpperCase()}${p.localCurrency && !indicativeLocal ? ". No internal local-currency figure was stored because there is no current governed rate." : "."} Nothing was sent to the client.` };
}
