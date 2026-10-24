"use client";

import { useActionState } from "react";
import { DESTINATIONS } from "@/lib/portfolio/destinations";
import { PERMISSION_TEXT } from "@/lib/portfolio/permissionText";
import { answerRequestAction, withdrawAction, type PortalState } from "./actions";

const input = "w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small";
const Msg = ({ s }: { s: PortalState }) => (s ? <p role={s.ok ? "status" : "alert"} className={`font-sans text-body-small ${s.ok ? "text-green-800" : "text-red-800"}`}>{s.message}</p> : null);

// Nothing is preselected. Agreeing needs at least one tick; declining is one deliberate choice and has no effect on delivery or any other service.
export function AnswerForm({ requestId, offered }: { requestId: string; offered: string[] }) {
  const [s, act, pending] = useActionState(answerRequestAction, null as PortalState);
  return (
    <form action={act} className="space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <fieldset className="space-y-1"><legend className="font-sans text-body-small font-medium text-ordift-ink">Uses you are asked about</legend>
        {DESTINATIONS.filter((d) => offered.includes(d.key)).map((d) => <label key={d.key} className="flex items-center gap-2 font-sans text-body-small"><input type="checkbox" name="destinations" value={d.key} />{d.label}</label>)}
      </fieldset>
      <div><label htmlFor="restrictions" className="block font-sans text-caption text-ordift-ink-muted mb-1">{PERMISSION_TEXT.restrictionsLabel}</label><input id="restrictions" name="restrictions" className={input} /></div>
      <div className="flex flex-wrap gap-2">
        <button name="decision" value="granted" className="rounded-md bg-ordift-ink px-4 py-2 font-sans text-body-small text-white" disabled={pending}>{PERMISSION_TEXT.accept}</button>
        <button name="decision" value="declined" className="rounded-md border border-black/20 px-4 py-2 font-sans text-body-small" disabled={pending}>{PERMISSION_TEXT.decline}</button>
      </div>
      <Msg s={s} />
    </form>
  );
}
export function WithdrawForm({ recordId }: { recordId: string }) {
  const [s, act, pending] = useActionState(withdrawAction, null as PortalState);
  return <form action={act} className="space-y-1"><input type="hidden" name="recordId" value={recordId} /><button className="rounded-md border border-black/20 px-3 py-1.5 font-sans text-caption" disabled={pending}>Withdraw this permission</button><Msg s={s} /></form>;
}
