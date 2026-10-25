import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnquiryPricingView } from "@/lib/enquiry/pricingPersistence";
import { ENQUIRY_PRICING_PERSISTENCE_ENABLED } from "@/lib/enquiry/pricingHistory";
import ConvertPanel from "./ConvertPanel";
import { CommunicateDiscountForm, DecideDiscountForm, ManageFollowUp, NewFollowUpForm, ProposeDiscountForm } from "./PricingForms";

const usd = (n: number) => `$${n.toFixed(2)} USD`;
const STATE_LABEL = { overdue: "Overdue", due_today: "Due today", upcoming: "Upcoming" } as const;

// Communicated prices, discount approval, handler and follow-up, and the step into the quotation. Renders NOTHING while the feature is off.
export default async function PricingPanel({ enquiryId, isSuperAdmin }: { enquiryId: string; isSuperAdmin: boolean }) {
  if (!ENQUIRY_PRICING_PERSISTENCE_ENABLED) return null;
  const view = await getEnquiryPricingView(enquiryId);
  if (!view) return null;
  const admin = createAdminClient();
  const { data: roleRows } = await admin.from("user_roles").select("user_id, roles!inner(slug)").in("roles.slug", ["staff", "admin", "super_admin"]);
  const ids = [...new Set((roleRows ?? []).map((r) => r.user_id as string))];
  const { data: profs } = ids.length ? await admin.from("profiles").select("id, full_name").in("id", ids).eq("access_status", "active") : { data: [] };
  const people = (profs ?? []).map((p) => ({ id: p.id as string, name: (p.full_name as string | null) ?? "Unnamed" }));
  const hasPrice = view.communications.length > 0;
  return (
    <section aria-labelledby="pf" className="space-y-6 rounded-xl border border-black/10 bg-white p-4">
      <div><h2 id="pf" className="font-serif font-medium text-body text-ordift-ink">Price, follow-up and quotation</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">What the client was told, every revision kept. Prices are USD; any QAR/GHS figure is an internal reference only. Nothing here is sent to the client.</p></div>

      <div className="space-y-2"><h3 className="font-sans text-body-small font-medium">Communicated prices</h3>
        {!hasPrice ? <p className="font-sans text-body-small text-ordift-ink-muted">Nothing saved yet. Use <Link href="/admin/enquiries/quick-price" className="underline">Quick Pricing</Link> and choose &ldquo;Save as communicated&rdquo;.</p> : (
          <ul className="space-y-2">{view.communications.map((c) => (
            <li key={c.id} className="rounded-lg border border-black/10 p-3 font-sans text-body-small">
              <strong>Revision {c.revision}</strong> · {usd(c.communicated)}{c.original !== null && c.original !== c.communicated ? ` (calculator total ${usd(c.original)}, discount applied)` : ""} · told by {c.channel} on {c.at.slice(0, 10)}
              <br /><span className="text-ordift-ink-muted">{c.scopeTitle}</span>{c.localNote && <><br /><span className="text-caption text-amber-900">{c.localNote}</span></>}
            </li>))}</ul>)}</div>

      {hasPrice && (
        <div className="space-y-2"><h3 className="font-sans text-body-small font-medium">Discount</h3>
          {!view.discount ? <ProposeDiscountForm enquiryId={enquiryId} /> : (
            <div className="space-y-2 rounded-lg border border-black/10 p-3 font-sans text-body-small">
              <p>{view.discount.type === "percentage" ? `${view.discount.value}%` : usd(view.discount.value)} off = {usd(view.discount.discountUsd)}, total {usd(view.discount.totalAfterUsd)} · <strong>{view.discount.status === "proposed" ? "waiting for Super Admin approval" : "approved"}</strong></p>
              <p className="text-caption text-ordift-ink-muted">Reason: {view.discount.reason}{view.discount.decisionNote ? ` · Decision: ${view.discount.decisionNote}` : ""}</p>
              {view.discount.status === "proposed" && (isSuperAdmin ? <DecideDiscountForm enquiryId={enquiryId} discountId={view.discount.id} /> : <p className="text-caption text-amber-900">Only a Super Admin can approve it. Do not tell the client about this discount yet.</p>)}
              {view.discount.status === "approved" && <CommunicateDiscountForm enquiryId={enquiryId} />}
            </div>)}</div>)}

      <div className="space-y-2"><h3 className="font-sans text-body-small font-medium">Handler and follow-up</h3>
        {view.followUp ? (
          <div className="space-y-3"><p className={`font-sans text-body-small ${view.followUp.state === "overdue" ? "text-red-800" : ""}`}><strong>{STATE_LABEL[view.followUp.state]}</strong> · {view.followUp.nextAction} · {view.followUp.handlerName} · {view.followUp.dueAt.slice(0, 16).replace("T", " ")}</p>
            <ManageFollowUp enquiryId={enquiryId} followUpId={view.followUp.id} people={people} /></div>
        ) : <NewFollowUpForm enquiryId={enquiryId} people={people} />}
        {view.followUpHistory.length > 0 && <details><summary className="cursor-pointer font-sans text-caption underline">History</summary><ul className="mt-1 font-sans text-caption text-ordift-ink-muted">{view.followUpHistory.map((h, i) => <li key={i}>{h.dueAt.slice(0, 10)} · {h.handlerName} · {h.status}{h.note ? ` · ${h.note}` : ""}</li>)}</ul></details>}</div>

      {hasPrice && (
        <div className="space-y-2"><h3 className="font-sans text-body-small font-medium">Proceed</h3>
          <ConvertPanel enquiryId={enquiryId} existing={view.conversion} /></div>)}
    </section>
  );
}
