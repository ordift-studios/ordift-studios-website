"use client";

import { useActionState } from "react";
import { communicateDiscountAction, completeFollowUpAction, convertAction, createFollowUpAction, decideDiscountAction, proposeDiscountAction, rescheduleFollowUpAction, type PState } from "./pricingActions";

const input = "w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small";
const btn = "rounded-md bg-ordift-ink px-4 py-2 font-sans text-body-small text-white disabled:opacity-60";
const ghost = "rounded-md border border-black/20 px-3 py-1.5 font-sans text-caption disabled:opacity-60";
const Msg = ({ s }: { s: PState }) => (s ? <p role={s.ok ? "status" : "alert"} className={`font-sans text-caption ${s.ok ? "text-green-800" : "text-red-800"}`}>{s.message}</p> : null);
const H = ({ id }: { id: string }) => <input type="hidden" name="enquiryId" value={id} />;
type Person = { id: string; name: string };

export function ProposeDiscountForm({ enquiryId }: { enquiryId: string }) {
  const [s, act, p] = useActionState(proposeDiscountAction, null as PState);
  return <form action={act} className="grid grid-cols-1 gap-2 sm:grid-cols-4"><H id={enquiryId} />
    <select name="type" aria-label="Discount type" className={input}><option value="percentage">Percent off</option><option value="fixed">Fixed USD off</option></select>
    <input name="value" type="number" step="0.01" min="0.01" placeholder="Amount" aria-label="Discount amount" className={input} required />
    <input name="reason" placeholder="Why (at least a sentence)" aria-label="Reason" className={`${input} sm:col-span-2`} required />
    <button className={btn} disabled={p}>Propose discount</button><div className="sm:col-span-3"><Msg s={s} /></div></form>;
}
export function DecideDiscountForm({ enquiryId, discountId }: { enquiryId: string; discountId: string }) {
  const [s, act, p] = useActionState(decideDiscountAction, null as PState);
  return <form action={act} className="flex flex-wrap items-center gap-2"><H id={enquiryId} /><input type="hidden" name="discountId" value={discountId} />
    <input name="note" placeholder="Decision note" aria-label="Decision note" className="min-w-0 flex-1 rounded-lg border border-black/15 px-3 py-1.5 font-sans text-caption" />
    <button name="decision" value="approved" className={ghost} disabled={p}>Approve</button><button name="decision" value="rejected" className={ghost} disabled={p}>Reject</button><Msg s={s} /></form>;
}
export function CommunicateDiscountForm({ enquiryId }: { enquiryId: string }) {
  const [s, act, p] = useActionState(communicateDiscountAction, null as PState);
  return <form action={act} className="grid grid-cols-1 gap-2 sm:grid-cols-3"><H id={enquiryId} />
    <input name="channel" placeholder="How you told the client (phone, WhatsApp…)" aria-label="Channel" className={input} required />
    <input name="communicatedAt" type="datetime-local" aria-label="When" className={input} />
    <button className={btn} disabled={p}>Save the discounted price as communicated</button><div className="sm:col-span-3"><Msg s={s} /></div></form>;
}
export function NewFollowUpForm({ enquiryId, people }: { enquiryId: string; people: Person[] }) {
  const [s, act, p] = useActionState(createFollowUpAction, null as PState);
  return <form action={act} className="grid grid-cols-1 gap-2 sm:grid-cols-4"><H id={enquiryId} />
    <select name="handlerId" aria-label="Handler" className={input} defaultValue="">{<option value="">Me</option>}{people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
    <input name="nextAction" placeholder="Next action (for example: call to confirm the date)" aria-label="Next action" className={`${input} sm:col-span-2`} required />
    <input name="dueAt" type="datetime-local" aria-label="Due" className={input} required />
    <button className={btn} disabled={p}>Set follow-up</button><div className="sm:col-span-3"><Msg s={s} /></div></form>;
}
export function ManageFollowUp({ enquiryId, followUpId, people }: { enquiryId: string; followUpId: string; people: Person[] }) {
  const [rs, ract, rp] = useActionState(rescheduleFollowUpAction, null as PState);
  const [cs, cact, cp] = useActionState(completeFollowUpAction, null as PState);
  return <div className="space-y-3">
    <form action={ract} className="grid grid-cols-1 gap-2 sm:grid-cols-4"><H id={enquiryId} /><input type="hidden" name="followUpId" value={followUpId} />
      <input name="dueAt" type="datetime-local" aria-label="New due date" className={input} required />
      <select name="handlerId" aria-label="Handler" className={input} defaultValue=""><option value="">Same handler</option>{people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <input name="reason" placeholder="Why (kept in history)" aria-label="Reason" className={input} required />
      <button className={ghost} disabled={rp}>Reschedule / hand over</button><div className="sm:col-span-4"><Msg s={rs} /></div></form>
    <form action={cact} className="flex flex-wrap items-center gap-2"><H id={enquiryId} /><input type="hidden" name="followUpId" value={followUpId} />
      <input name="note" placeholder="Outcome (optional)" aria-label="Outcome" className="min-w-0 flex-1 rounded-lg border border-black/15 px-3 py-1.5 font-sans text-caption" />
      <button className={ghost} disabled={cp}>Mark done</button><Msg s={cs} /></form></div>;
}
export function ConvertForm({ enquiryId }: { enquiryId: string }) {
  const [s, act, p] = useActionState(convertAction, null as PState);
  return <form action={act} className="space-y-2"><H id={enquiryId} /><button className={btn} disabled={p}>Proceed to quotation</button><Msg s={s} />
    <p className="font-sans text-caption text-ordift-ink-muted">Creates one DRAFT quotation from the latest communicated price. It is not sent, and no booking, payment, revenue, agreement or payable is created. Pressing it again never makes a second one.</p></form>;
}
