"use client";

import { useState, useTransition } from "react";
import type { ActionState } from "@/lib/shared/actionState";
import type { Conflict } from "@/lib/bookings/rules";
import { confirmSentenceFor } from "@/lib/bookings/form";
import { confirmBookingAction, previewBookingAction, type BookingPreviewState } from "./bookingActions";

// Super Admin only (the page does not render this for anyone else, and the server actions refuse everyone else again).
// Fields are held in state and sent by calling the server actions directly, so a failed check never wipes what was typed.
// Confirming is allowed only after a fresh check shows no blockers, and only after typing the exact confirmation sentence.

export type SegmentDraft = { start: string; end: string; tz: string; kind: "on_site" | "online" | "studio"; location: string; platform: string; note: string };
type Res = { method: string; reference: string; on: string; confirm: boolean };
const ZONES = ["Asia/Qatar", "Africa/Accra", "Europe/London", "Asia/Dubai", "Europe/Paris", "America/New_York", "UTC"];
const METHODS: [string, string][] = [["call", "Phone or video call"], ["direct_message", "Direct message"], ["in_person", "In person"], ["email", "Email"]];
const blankSegment = (tz = "Asia/Qatar"): SegmentDraft => ({ start: "", end: "", tz, kind: "on_site", location: "", platform: "", note: "" });
const input = "w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";
const label = "font-sans text-caption text-ordift-ink-muted block mb-1";
const btn = "min-h-11 px-5 rounded-full font-sans text-body-small disabled:opacity-50";

export default function BookingConfirmForm(p: {
  enquiryId: string; quotationId: string; reference: string; expectedVersion: number; isChange: boolean; assignable: { profileId: string; label: string }[]; escalatorOptions: string[];
  initial: { assignedProfileId: string | null; segments: SegmentDraft[]; basis: string };
}) {
  const [assigned, setAssigned] = useState(p.initial.assignedProfileId ?? "");
  const [segs, setSegs] = useState<SegmentDraft[]>(p.initial.segments.length ? p.initial.segments : [blankSegment()]);
  const [esc, setEsc] = useState<string[]>([]);
  const [clarKind, setClarKind] = useState(""), [clarEvidence, setClarEvidence] = useState(""), [basis, setBasis] = useState(p.initial.basis), [sentence, setSentence] = useState("");
  const [res, setRes] = useState<Record<string, Res>>({});
  const [preview, setPreview] = useState<BookingPreviewState>(null), [result, setResult] = useState<ActionState>(null), [stale, setStale] = useState(true);
  const [pending, start] = useTransition();
  const verb = p.isChange ? "change" : "confirm";
  const touch = () => { setStale(true); setResult(null); };

  const build = (): FormData => {
    const fd = new FormData();
    fd.set("enquiryId", p.enquiryId); fd.set("quotationId", p.quotationId); fd.set("expectedVersion", String(p.expectedVersion)); fd.set("assignedProfileId", assigned);
    fd.set("segCount", String(segs.length));
    segs.forEach((s, i) => { fd.set(`seg${i}_start`, s.start); fd.set(`seg${i}_end`, s.end); fd.set(`seg${i}_tz`, s.tz); fd.set(`seg${i}_kind`, s.kind); fd.set(`seg${i}_location`, s.location); fd.set(`seg${i}_platform`, s.platform); fd.set(`seg${i}_note`, s.note); });
    esc.forEach((e) => fd.append("escalator", e));
    fd.set("clarKind", clarKind); fd.set("clarEvidence", clarEvidence); fd.set("basis", basis); fd.set("confirmSentence", sentence);
    const keys = Object.keys(res); fd.set("resCount", String(keys.length));
    keys.forEach((k, i) => { fd.set(`res${i}_key`, k); fd.set(`res${i}_method`, res[k].method); fd.set(`res${i}_reference`, res[k].reference); fd.set(`res${i}_on`, res[k].on); if (res[k].confirm) fd.set(`res${i}_confirm`, "on"); });
    return fd;
  };
  const check = () => start(async () => { setResult(null); const r = await previewBookingAction(null, build()); setPreview(r); setStale(false); });
  // After a REFUSAL (for example a mistyped sentence) the last check still stands, so the person can correct and retry without checking again; after a success the page data is stale.
  const submit = () => start(async () => { const r = await confirmBookingAction(null, build()); setResult(r); if (r?.ok) setStale(true); });
  const setSeg = (i: number, patch: Partial<SegmentDraft>) => { setSegs((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s))); touch(); };
  const setR = (k: string, patch: Partial<Res>) => { setRes((all) => ({ ...all, [k]: { ...(all[k] ?? { method: "call", reference: "", on: "", confirm: false }), ...patch } })); touch(); };

  const firm: Conflict[] = preview?.ok ? preview.conflicts.filter((c) => c.firm) : [];
  const soft: Conflict[] = preview?.ok ? preview.conflicts.filter((c) => !c.firm) : [];
  const ready = !stale && preview?.ok === true && preview.blockers.length === 0;

  return (
    <div className="space-y-5" aria-busy={pending}>
      <div>
        <label htmlFor="bk-person" className={label}>Assigned person (the team member who will deliver this booking)</label>
        <select id="bk-person" className={input} value={assigned} onChange={(e) => { setAssigned(e.target.value); touch(); }}>
          <option value="">Not assigned yet (conflicts cannot be checked)</option>
          {p.assignable.map((a) => <option key={a.profileId} value={a.profileId}>{a.label}</option>)}
        </select>
      </div>

      <fieldset className="space-y-4">
        <legend className="font-sans text-body-small font-medium text-ordift-ink">Confirmed date, time and place</legend>
        {segs.map((s, i) => (
          <div key={i} className="rounded-lg border border-black/10 p-4 space-y-3">
            <div className="flex items-center justify-between"><p className="font-sans text-caption font-semibold text-ordift-ink">Session {i + 1}</p>
              {segs.length > 1 ? <button type="button" className="font-sans text-caption underline text-ordift-ink-muted" onClick={() => { setSegs((all) => all.filter((_, j) => j !== i)); touch(); }}>Remove</button> : null}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={label} htmlFor={`s${i}a`}>Starts (local time at the place)</label><input id={`s${i}a`} type="datetime-local" className={input} value={s.start} onChange={(e) => setSeg(i, { start: e.target.value })} /></div>
              <div><label className={label} htmlFor={`s${i}b`}>Ends</label><input id={`s${i}b`} type="datetime-local" className={input} value={s.end} onChange={(e) => setSeg(i, { end: e.target.value })} /></div>
              <div><label className={label} htmlFor={`s${i}z`}>Time zone</label><select id={`s${i}z`} className={input} value={s.tz} onChange={(e) => setSeg(i, { tz: e.target.value })}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select></div>
              <div><label className={label} htmlFor={`s${i}k`}>Type</label><select id={`s${i}k`} className={input} value={s.kind} onChange={(e) => setSeg(i, { kind: e.target.value as SegmentDraft["kind"] })}><option value="on_site">On site (client location)</option><option value="studio">Studio</option><option value="online">Online</option></select></div>
            </div>
            {s.kind === "online"
              ? <div><label className={label} htmlFor={`s${i}p`}>Platform (e.g. Zoom, Google Meet)</label><input id={`s${i}p`} className={input} value={s.platform} onChange={(e) => setSeg(i, { platform: e.target.value })} /></div>
              : <div><label className={label} htmlFor={`s${i}l`}>Place</label><input id={`s${i}l`} className={input} value={s.location} onChange={(e) => setSeg(i, { location: e.target.value })} /></div>}
            <div><label className={label} htmlFor={`s${i}n`}>Note (optional)</label><input id={`s${i}n`} className={input} value={s.note} onChange={(e) => setSeg(i, { note: e.target.value })} /></div>
          </div>
        ))}
        {segs.length < 20 ? <button type="button" className={`${btn} border border-black/20 text-ordift-ink`} onClick={() => { setSegs((all) => [...all, blankSegment(all[all.length - 1]?.tz)]); touch(); }}>Add another session (another day or place)</button> : null}
      </fieldset>

      {p.escalatorOptions.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="font-sans text-body-small font-medium text-ordift-ink">Circumstances that make an agreement necessary (tick any that apply)</legend>
          {p.escalatorOptions.filter((e) => e !== "multi_day_assignment").map((e) => (
            <label key={e} className="flex items-center gap-2 font-sans text-body-small text-ordift-ink"><input type="checkbox" checked={esc.includes(e)} onChange={(ev) => { setEsc((all) => ev.target.checked ? [...all, e] : all.filter((x) => x !== e)); touch(); }} />{e.replaceAll("_", " ")}</label>
          ))}
          <p className="font-sans text-caption text-ordift-ink-muted">A multi-day schedule is detected automatically from the sessions above.</p>
        </fieldset>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="font-sans text-body-small font-medium text-ordift-ink">Payment terms clarification (only if the check below says the terms are unclear or contradict the condition)</legend>
        <select className={input} value={clarKind} onChange={(e) => { setClarKind(e.target.value); touch(); }} aria-label="How the payment terms were clarified">
          <option value="">No clarification needed</option><option value="client_confirmed_in_writing">The client confirmed the payment condition in writing</option><option value="quotation_revised">The quotation was revised</option>
        </select>
        {clarKind ? <textarea className={input} rows={2} placeholder="Where the written confirmation or revision is recorded (at least a sentence)" value={clarEvidence} onChange={(e) => { setClarEvidence(e.target.value); touch(); }} /> : null}
      </fieldset>

      <div><label className={label} htmlFor="bk-basis">Note for the record (optional)</label><textarea id="bk-basis" className={input} rows={2} value={basis} onChange={(e) => { setBasis(e.target.value); touch(); }} /></div>

      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={pending} onClick={check} className={`${btn} bg-ordift-navy-950 text-white`}>{pending ? "Checking…" : "Check readiness and conflicts"}</button>
      </div>

      {preview && !preview.ok ? <p role="alert" className="rounded-lg bg-red-50 p-3 font-sans text-body-small text-red-900">{preview.error}</p> : null}
      {preview?.ok ? (
        <div className="space-y-4" role="status">
          <p className="font-sans text-caption text-ordift-ink-muted">Checked against booking rules version {preview.settingsVersion}{preview.agreement.required ? ` · agreement required (${preview.agreement.reasons.join(", ")})` : " · no agreement required"}{stale ? " · you have changed something since: check again" : ""}</p>
          {preview.blockers.length === 0 ? <p className="rounded-lg bg-green-50 p-3 font-sans text-body-small text-green-900">No blockers. The database will check every rule again when you {verb}.</p>
            : <ul className="list-disc pl-5 space-y-1 rounded-lg bg-amber-50 p-3 font-sans text-body-small text-amber-950">{preview.blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
          {soft.length ? <div><p className="font-sans text-body-small font-medium text-ordift-ink">In-progress overlaps (warning only)</p><ul className="list-disc pl-5 font-sans text-body-small text-ordift-ink-muted">{soft.map((c) => <li key={c.key}>{c.label} · {c.from.slice(0, 10)} to {c.to.slice(0, 10)}</li>)}</ul></div> : null}
          {firm.filter((c) => !c.overridable).map((c) => (
            <div key={c.key} className="rounded-lg border border-red-300 bg-red-50 p-4 space-y-1" role="alert">
              <p className="font-sans text-body-small font-medium text-red-950">Overlap with a confirmed commitment: {c.label} ({c.kind.replace("_", " ")}) · {c.from.slice(0, 16).replace("T", " ")} to {c.to.slice(0, 16).replace("T", " ")}{c.from.length > 10 ? " UTC" : ""}</p>
              <p className="font-sans text-caption text-red-900">This cannot be cleared by a reason or a recorded check. Change the assigned person or the time, then check again.</p>
            </div>
          ))}
          {firm.filter((c) => c.overridable).map((c) => {
            const r = res[c.key] ?? { method: "call", reference: "", on: "", confirm: false };
            return (
              <div key={c.key} className="rounded-lg border border-amber-300 p-4 space-y-3">
                <p className="font-sans text-body-small font-medium text-ordift-ink">Firm conflict: {c.label} ({c.kind.replace("_", " ")}) · {c.from.slice(0, 10)} to {c.to.slice(0, 10)}</p>
                <p className="font-sans text-caption text-ordift-ink-muted">A reason is not enough. Clear this only by recording that the assigned person confirmed they are available, with how and where it is recorded.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className={label}>How you checked</label><select className={input} value={r.method} onChange={(e) => setR(c.key, { method: e.target.value })}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                  <div><label className={label}>Date you checked</label><input type="date" className={input} value={r.on} onChange={(e) => setR(c.key, { on: e.target.value })} /></div>
                  <div><label className={label}>Where it is recorded</label><input className={input} placeholder="e.g. WhatsApp message of 7 Nov" value={r.reference} onChange={(e) => setR(c.key, { reference: e.target.value })} /></div>
                </div>
                <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink"><input type="checkbox" className="mt-1" checked={r.confirm} onChange={(e) => setR(c.key, { confirm: e.target.checked })} />I confirm I verified this availability directly with the assigned person.</label>
              </div>
            );
          })}
          {firm.length ? <button type="button" disabled={pending} onClick={check} className={`${btn} border border-black/20 text-ordift-ink`}>Re-check</button> : null}
        </div>
      ) : null}

      {ready ? (
        <div className="space-y-3 border-t border-black/10 pt-4">
          <label className={label} htmlFor="bk-sentence">To {verb} this booking, type exactly: <span className="font-semibold text-ordift-ink">{confirmSentenceFor(p.reference, verb)}</span></label>
          <input id="bk-sentence" className={input} value={sentence} autoComplete="off" onChange={(e) => { setSentence(e.target.value); setResult(null); }} />
          <button type="button" disabled={pending || sentence.trim() === ""} onClick={submit} className={`${btn} bg-ordift-gold-pressed text-white`}>{pending ? "Saving…" : p.isChange ? "Change booking" : "Confirm booking"}</button>
          <p className="font-sans text-caption text-ordift-ink-muted">This records the booking and moves the enquiry to Booked. It sends no email and creates no payment, invoice or receivable.</p>
        </div>
      ) : null}

      {result?.ok ? <p role="status" className="rounded-lg bg-green-50 p-3 font-sans text-body-small text-green-900">{result.message}</p> : null}
      {result && !result.ok ? <p role="alert" className="rounded-lg bg-red-50 p-3 font-sans text-body-small text-red-900">{result.error}</p> : null}
    </div>
  );
}
