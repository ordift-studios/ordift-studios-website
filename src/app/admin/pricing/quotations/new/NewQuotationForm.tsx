"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createQuotationAction,
  updateQuotationDraftAction,
  suggestCorporateHeadshotLineAction,
  type CreateQuotationState,
  type SimpleActionState,
} from "../actions";
import SubmitButton from "@/components/admin/SubmitButton";

type ClientOption = { id: string; fullName: string | null; email: string | null };
type MarketOption = { slug: string; name: string };

type LineItem = {
  serviceItem: string;
  description: string;
  quantity: string;
  unitBasis: string;
  sellingRate: string;
  discountPercent: string;
  taxPercent: string;
  sourceType: "pricing" | "manual" | "adjusted";
  sourceReference: string;
};

const EMPTY_ITEM: LineItem = {
  serviceItem: "",
  description: "",
  quantity: "1",
  unitBasis: "item",
  sellingRate: "",
  discountPercent: "",
  taxPercent: "",
  sourceType: "manual",
  sourceReference: "",
};

const PRODUCT_OPTIONS: { value: string; label: string }[] = [
  { value: "individual_headshot", label: "Corporate Headshot — Individual" },
  { value: "executive_portrait", label: "Executive Portrait" },
  { value: "team_headshots", label: "Team Headshots" },
];

// Connect Client Quotations to existing Pricing (2026-09-16, Task C) —
// a small, real, working integration with Corporate & Headshots Pricing
// (the exact scenario named in the request: "100 staff need corporate
// headshots"). Reuses the existing estimator via a server action;
// suggests a line item the admin can review and add, never silently
// inserts one. Other Ordift services (Film, Advertising, Events, Video
// Production etc.) each have their own distinct pricing dimensions not
// yet wired here — those stay authorized manual entries, correctly
// marked source_type: 'manual', never a fabricated price.
function PricingPrefillPanel({ markets, onAdd }: { markets: MarketOption[]; onAdd: (item: LineItem) => void }) {
  const [state, formAction] = useActionState(suggestCorporateHeadshotLineAction, null);
  const [product, setProduct] = useState("individual_headshot");
  const [marketName, setMarketName] = useState("");

  useEffect(() => {
    if (state?.ok === true) {
      onAdd({
        serviceItem: state.item.serviceItem,
        description: state.item.description ?? "",
        quantity: String(state.item.quantity),
        unitBasis: state.item.unitBasis,
        sellingRate: String(state.item.sellingRate),
        discountPercent: "",
        taxPercent: "",
        sourceType: "pricing",
        sourceReference: state.item.sourceReference ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (markets.length === 0) return null;

  return (
    <details className="rounded-xl border border-ordift-gold/40 bg-white p-4">
      <summary className="font-sans text-body-small font-semibold text-ordift-ink cursor-pointer">Prefill from Pricing — Corporate &amp; Headshots</summary>
      <form action={formAction} className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
        <select
          name="marketSlug"
          required
          className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-caption"
          onChange={(e) => setMarketName(e.target.selectedOptions[0]?.text ?? "")}
        >
          <option value="">Market…</option>
          {markets.map((m) => (
            <option key={m.slug} value={m.slug}>{m.name}</option>
          ))}
        </select>
        <input type="hidden" name="marketName" value={marketName} />
        <select name="product" value={product} onChange={(e) => setProduct(e.target.value)} className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-caption">
          {PRODUCT_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        {product === "team_headshots" && (
          <input name="numberOfPeople" type="number" min="1" placeholder="Number of people" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-caption" />
        )}
        <SubmitButton pendingLabel="Calculating…" className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white">
          Get Rate
        </SubmitButton>
      </form>
      {state?.ok === false && state.requiresCustomQuote && (
        <p className="font-sans text-caption text-amber-700 mt-2">{state.reason} — add a manual line item below instead.</p>
      )}
      {state?.ok === false && !state.requiresCustomQuote && <p className="font-sans text-caption text-red-700 mt-2">{state.error}</p>}
      {state?.ok === true && <p className="font-sans text-caption text-green-700 mt-2">Added as a line item below (USD, from Pricing).</p>}
    </details>
  );
}

export type QuotationFormInitialData = {
  quotationId: string;
  partyType: "client" | "prospect";
  clientProfileId: string | null;
  prospectName: string;
  prospectCompany: string;
  prospectEmail: string;
  prospectPhone: string;
  items: LineItem[];
  currency: string;
  validUntil: string;
  paymentBookingTerms: string;
  commercialNotes: string;
};

// Task 1 — Client Quotation record management (2026-09-16). Same form
// now serves both Create and Edit (a draft only — see
// updateClientQuotationDraft()'s own guard) rather than a duplicated
// component, so the party/items/terms UI can never drift between the
// two modes.
export function NewQuotationForm({ clients, markets, editing }: { clients: ClientOption[]; markets: MarketOption[]; editing?: QuotationFormInitialData }) {
  const router = useRouter();
  const createState = useActionState<CreateQuotationState, FormData>(createQuotationAction, null);
  const editState = useActionState<SimpleActionState, FormData>(updateQuotationDraftAction, null);
  const [formAction] = editing ? [editState[1]] : [createState[1]];
  const [partyType, setPartyType] = useState<"client" | "prospect">(editing?.partyType ?? "prospect");
  const [items, setItems] = useState<LineItem[]>(editing?.items ?? [{ ...EMPTY_ITEM }]);

  // Production fix (2026-09-16) — navigation happens HERE, client-side,
  // once the action's result confirms success, rather than calling
  // redirect() inside the action itself (see actions.ts's own comment
  // for why that combination was unreliable on this Next version and
  // left the user on a blank screen with no visible error).
  useEffect(() => {
    if (!editing && createState[0]?.ok === true) router.push(`/admin/pricing/quotations/${createState[0].quotationId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createState[0]]);
  useEffect(() => {
    if (editing && editState[0]?.ok === true) router.push(`/admin/pricing/quotations/${editing.quotationId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editState[0]]);

  const errorMessage = editing ? (editState[0]?.ok === false ? editState[0].error : null) : createState[0]?.ok === false ? createState[0].error : null;

  // Editing a field on a Pricing-derived item marks it 'adjusted' (still
  // keeps its sourceReference for audit context) — a genuinely manual
  // item (sourceType already 'manual') stays 'manual' while its own
  // fields are first typed in, never flipped just because it was edited.
  function updateItem(i: number, field: keyof LineItem, value: string) {
    setItems((prev) =>
      prev.map((item, idx) =>
        idx === i ? { ...item, [field]: value, sourceType: item.sourceType === "pricing" && field !== "sourceType" ? "adjusted" : item.sourceType } : item
      )
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {editing && <input type="hidden" name="quotationId" value={editing.quotationId} />}
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Client / Prospect</h2>
        <div className="flex gap-4 font-sans text-body-small text-ordift-ink">
          <label className="flex items-center gap-2">
            <input type="radio" name="partyTypeToggle" checked={partyType === "client"} onChange={() => setPartyType("client")} />
            Registered Client
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="partyTypeToggle" checked={partyType === "prospect"} onChange={() => setPartyType("prospect")} />
            Offline Prospect
          </label>
        </div>
        {partyType === "client" ? (
          <select name="clientProfileId" required defaultValue={editing?.clientProfileId ?? ""} className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small">
            <option value="">Choose a Client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.fullName ?? c.email ?? c.id}</option>
            ))}
          </select>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input name="prospectName" required defaultValue={editing?.prospectName} placeholder="Prospect name (required)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <input name="prospectCompany" defaultValue={editing?.prospectCompany} placeholder="Company (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <input name="prospectEmail" type="email" defaultValue={editing?.prospectEmail} placeholder="Email (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <input name="prospectPhone" defaultValue={editing?.prospectPhone} placeholder="Phone (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          </div>
        )}
      </section>

      <PricingPrefillPanel markets={markets} onAdd={(item) => setItems((prev) => [...prev, item])} />

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Line Items</h2>
        {items.map((item, i) => (
          <div key={i} className="grid grid-cols-2 sm:grid-cols-7 gap-2 items-end border-b border-black/5 pb-3">
            <input type="hidden" name={`items[${i}][sourceType]`} value={item.sourceType} />
            <input type="hidden" name={`items[${i}][sourceReference]`} value={item.sourceReference} />
            <div className="col-span-2 sm:col-span-7 flex items-center gap-2">
              {item.sourceType !== "manual" && (
                <span className="px-2 py-0.5 rounded-full font-sans text-[0.65rem] bg-ordift-gold/20 text-ordift-gold-pressed whitespace-nowrap">
                  {item.sourceType === "pricing" ? "From Pricing" : "From Pricing (adjusted)"}
                </span>
              )}
              {item.sourceReference && <span className="font-sans text-[0.65rem] text-ordift-ink-muted truncate">{item.sourceReference}</span>}
              <button type="button" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))} className="ml-auto font-sans text-[0.65rem] text-red-700 underline underline-offset-4">
                Remove
              </button>
            </div>
            <input name={`items[${i}][serviceItem]`} value={item.serviceItem} onChange={(e) => updateItem(i, "serviceItem", e.target.value)} placeholder="Service/item" required className="col-span-2 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-caption" />
            <input name={`items[${i}][description]`} value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} placeholder="Description" className="col-span-2 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-caption" />
            <input name={`items[${i}][quantity]`} value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} type="number" min="0.01" step="0.01" placeholder="Qty" required className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-caption" />
            <select name={`items[${i}][unitBasis]`} value={item.unitBasis} onChange={(e) => updateItem(i, "unitBasis", e.target.value)} className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-caption">
              <option value="hour">Hour</option>
              <option value="half_day">Half-day</option>
              <option value="full_day">Full-day</option>
              <option value="item">Item</option>
              <option value="service">Service</option>
              <option value="other">Other</option>
            </select>
            <input name={`items[${i}][sellingRate]`} value={item.sellingRate} onChange={(e) => updateItem(i, "sellingRate", e.target.value)} type="number" min="0" step="0.01" placeholder="Rate" required className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-caption" />
            <input name={`items[${i}][discountPercent]`} value={item.discountPercent} onChange={(e) => updateItem(i, "discountPercent", e.target.value)} type="number" min="0" max="100" step="0.1" placeholder="Discount %" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-caption" />
            <input name={`items[${i}][taxPercent]`} value={item.taxPercent} onChange={(e) => updateItem(i, "taxPercent", e.target.value)} type="number" min="0" step="0.1" placeholder="Tax %" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-caption" />
          </div>
        ))}
        <button type="button" onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])} className="font-sans text-caption font-semibold text-ordift-gold-pressed underline underline-offset-4">
          + Add manual line item
        </button>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Terms</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input name="currency" required defaultValue={editing?.currency ?? "GHS"} placeholder="Currency (e.g. GHS)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="validUntil" type="date" defaultValue={editing?.validUntil} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <textarea name="paymentBookingTerms" defaultValue={editing?.paymentBookingTerms} placeholder="Payment / booking terms (optional)" className="sm:col-span-2 rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" rows={2} />
          <textarea name="commercialNotes" defaultValue={editing?.commercialNotes} placeholder="Commercial notes (optional, internal)" className="sm:col-span-2 rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" rows={2} />
        </div>
      </section>

      {errorMessage && <p className="font-sans text-body-small text-red-700">{errorMessage}</p>}
      <SubmitButton pendingLabel={editing ? "Saving…" : "Creating…"} className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white">
        {editing ? "Save Changes" : "Create Quotation"}
      </SubmitButton>
    </form>
  );
}
