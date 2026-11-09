import { createClient } from "@/lib/supabase/server";
import CancelInstructionButton from "./CancelInstructionButton";

const LABEL: Record<string, string> = { pending: "Awaiting your payment", awaiting_verification: "Proof submitted, awaiting verification", additional_info_required: "More information needed" };

// "Your open payment instructions": what is already holding part of the balance on this project, so a refusal to start another one is never a mystery. Only the client's own rows are readable (row-level security).
export default async function OpenInstructions({ kind, id }: { kind: string; id: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("payments").select("id, record_id, status, payment_method, payment_type, reference_amount_usd, proof_of_payment_asset_path, created_at")
    .eq("entity_type", kind === "enquiry" ? "enquiry" : "workshop_registration").eq("entity_id", id).in("status", ["pending", "awaiting_verification", "additional_info_required"]).order("created_at", { ascending: true });
  const rows = data ?? [];
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="open-instructions" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
      <h2 id="open-instructions" className="font-serif font-medium text-body text-ordift-ink">Your open payment instructions</h2>
      <p className="mt-1 font-sans text-caption text-ordift-ink-muted">Together, open instructions cannot be more than you still owe, so a new one may be refused until another is finished or cancelled. An unpaid bank-transfer instruction can be cancelled here; a card attempt that is not completed frees itself after 24 hours.</p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.id as string} className="flex flex-wrap items-center gap-3 font-sans text-body-small text-ordift-ink">
            <span><strong>{r.record_id as string}</strong> · {r.payment_method === "gateway" ? "Card / Mobile Money" : "Bank transfer"} · USD {Number(r.reference_amount_usd).toFixed(2)} · {LABEL[r.status as string] ?? (r.status as string)}</span>
            {r.status === "pending" && r.payment_method === "bank_transfer" && !r.proof_of_payment_asset_path ? <CancelInstructionButton paymentId={r.id as string} /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
