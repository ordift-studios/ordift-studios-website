import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { describeResolveError, validateResolution, type ReviewReason } from "@/lib/payments/reviewCases";

// Server side of the payment review queue. Reads are tolerant: if the payment-integrity migration is not applied (no table) the queue is simply empty, so the Payments page keeps working before release.
export type OpenReviewCase = { id: string; reason: ReviewReason; openedAt: string; openedSource: string; detail: Record<string, unknown>; payment: { id: string; recordId: string | null; status: string; method: string; currency: string; amount: number; usd: number; entityId: string } | null };

export async function listOpenReviewCases(): Promise<OpenReviewCase[]> {
  const admin = createAdminClient();
  const { data: cases, error } = await admin.from("payment_review_cases").select("id, payment_id, reason, opened_at, opened_source, detail").eq("status", "open").order("opened_at", { ascending: true });
  if (error || !cases?.length) return [];
  const ids = [...new Set(cases.map((c) => c.payment_id as string))];
  const { data: pays } = await admin.from("payments").select("id, record_id, status, payment_method, payment_currency, converted_amount, reference_amount_usd, entity_id").in("id", ids);
  const byId = new Map((pays ?? []).map((p) => [p.id as string, p]));
  return cases.map((c) => {
    const p = byId.get(c.payment_id as string);
    return { id: c.id as string, reason: c.reason as ReviewReason, openedAt: c.opened_at as string, openedSource: c.opened_source as string, detail: (c.detail ?? {}) as Record<string, unknown>,
      payment: p ? { id: p.id as string, recordId: (p.record_id as string | null) ?? null, status: p.status as string, method: p.payment_method as string, currency: p.payment_currency as string, amount: Number(p.converted_amount), usd: Number(p.reference_amount_usd), entityId: p.entity_id as string } : null };
  });
}

export async function resolveReviewCase(params: { caseId: string; resolverId: string; resolution: string; note: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const v = validateResolution(params.resolution, params.note);
  if (!v.ok) return v;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("resolve_payment_review_case", { p_case_id: params.caseId, p_resolver: params.resolverId, p_resolution: v.resolution, p_note: params.note.trim() });
  if (error) return { ok: false, error: describeResolveError(error.message) };
  const r = (data ?? {}) as { payment_id?: string; reason?: string };
  await logActivity({ actorUserId: params.resolverId, action: "payment.review_case_resolved", entityType: "payment", entityId: r.payment_id ?? params.caseId, metadata: { caseId: params.caseId, reason: r.reason, resolution: v.resolution } });
  return { ok: true };
}
