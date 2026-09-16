"use client";

import { useActionState, useState } from "react";
import { createQuotationAction, type ActionState } from "../actions";
import SubmitButton from "@/components/admin/SubmitButton";

type ClientOption = { id: string; fullName: string | null; email: string | null };

type LineItem = { serviceItem: string; description: string; quantity: string; unitBasis: string; sellingRate: string; discountPercent: string; taxPercent: string };

const EMPTY_ITEM: LineItem = { serviceItem: "", description: "", quantity: "1", unitBasis: "item", sellingRate: "", discountPercent: "", taxPercent: "" };

export function NewQuotationForm({ clients }: { clients: ClientOption[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(createQuotationAction, null);
  const [partyType, setPartyType] = useState<"client" | "prospect">("prospect");
  const [items, setItems] = useState<LineItem[]>([{ ...EMPTY_ITEM }]);

  function updateItem(i: number, field: keyof LineItem, value: string) {
    setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item)));
  }

  return (
    <form action={formAction} className="space-y-6">
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
          <select name="clientProfileId" required className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small">
            <option value="">Choose a Client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.fullName ?? c.email ?? c.id}</option>
            ))}
          </select>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input name="prospectName" required placeholder="Prospect name (required)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <input name="prospectCompany" placeholder="Company (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <input name="prospectEmail" type="email" placeholder="Email (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
            <input name="prospectPhone" placeholder="Phone (optional)" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Line Items</h2>
        {items.map((item, i) => (
          <div key={i} className="grid grid-cols-2 sm:grid-cols-7 gap-2 items-end border-b border-black/5 pb-3">
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
          + Add line item
        </button>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Terms</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input name="currency" required placeholder="Currency (e.g. GHS)" defaultValue="GHS" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <input name="validUntil" type="date" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          <textarea name="paymentBookingTerms" placeholder="Payment / booking terms (optional)" className="sm:col-span-2 rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" rows={2} />
          <textarea name="commercialNotes" placeholder="Commercial notes (optional, internal)" className="sm:col-span-2 rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" rows={2} />
        </div>
      </section>

      {state?.ok === false && <p className="font-sans text-body-small text-red-700">{state.error}</p>}
      <SubmitButton pendingLabel="Creating…" className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white">
        Create Quotation
      </SubmitButton>
    </form>
  );
}
