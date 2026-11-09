"use client";

import { useState, useTransition } from "react";
import { checkAvailabilityAction } from "./availabilityActions";
import { NOT_A_RESERVATION, STATE_LABEL, STATE_MEANING, type AvailabilityState } from "@/lib/bookings/availability";
import type { AvailabilityPanelData, AvailabilityResult } from "@/lib/bookings/availabilityService";

// "Check availability (before quoting)". For staff and admins. It reads the booking schedule and records that a check was made; it reserves nothing and creates no booking.
const card = "rounded-xl border border-black/10 bg-white p-6 space-y-4";
const field = "w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";
const lab = "font-sans text-caption text-ordift-ink-muted block mb-1";
const ZONES = ["Asia/Qatar", "Africa/Accra", "Europe/London", "Asia/Dubai", "Europe/Paris", "America/New_York", "UTC"];
const STYLE: Record<AvailabilityState, { box: string; icon: string }> = {
  available: { box: "border-green-300 bg-green-50 text-green-950", icon: "✓" },
  tentative: { box: "border-amber-300 bg-amber-50 text-amber-950", icon: "~" },
  conflicting: { box: "border-red-300 bg-red-50 text-red-950", icon: "✕" },
  unverified: { box: "border-black/20 bg-black/5 text-ordift-ink", icon: "?" },
};
const when = (iso: string) => new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";

export default function AvailabilityCheckPanel({ enquiryId, data }: { enquiryId: string; data: AvailabilityPanelData }) {
  const [pending, start] = useTransition();
  const [person, setPerson] = useState("");
  const [s, setS] = useState({ start: "", end: "", tz: "Asia/Qatar", kind: "on_site", place: "" });
  const [v, setV] = useState({ method: "", on: "", ref: "", confirm: false });
  const [result, setResult] = useState<AvailabilityResult | null>(null);

  const submit = () => start(async () => {
    const fd = new FormData();
    fd.set("enquiryId", enquiryId); fd.set("assignedProfileId", person); fd.set("segCount", "1");
    fd.set("seg0_start", s.start); fd.set("seg0_end", s.end); fd.set("seg0_tz", s.tz); fd.set("seg0_kind", s.kind); fd.set("seg0_location", s.place);
    if (s.kind === "online") fd.set("seg0_platform", s.place || "online");
    fd.set("avMethod", v.method); fd.set("avOn", v.on); fd.set("avReference", v.ref); if (v.confirm) fd.set("avConfirm", "on");
    setResult(await checkAvailabilityAction(fd));
  });

  const latest = data.latest;
  return (
    <section className={card} aria-labelledby="avail-heading">
      <div>
        <h2 id="avail-heading" className="font-serif font-medium text-body text-ordift-ink">Check availability (before quoting)</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">{NOT_A_RESERVATION}</p>
      </div>
      {latest ? <p className="font-sans text-body-small text-ordift-ink">Last check: <strong>{latest.label}</strong> · {when(latest.at)}{latest.byLabel ? ` · ${latest.byLabel}` : ""}{latest.stale ? " · older than 7 days: check again before relying on it" : ""}</p>
        : <p className="font-sans text-body-small text-ordift-ink-muted">No availability check has been made for this enquiry.</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><label htmlFor="av-person" className={lab}>Who would deliver it?</label>
          <select id="av-person" className={field} value={person} onChange={(e) => setPerson(e.target.value)}><option value="">Not chosen yet (cannot be checked)</option>{data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label htmlFor="av-start" className={lab}>Starts (local time at the place)</label><input id="av-start" type="datetime-local" className={field} value={s.start} onChange={(e) => setS({ ...s, start: e.target.value })} /></div>
        <div><label htmlFor="av-end" className={lab}>Ends</label><input id="av-end" type="datetime-local" className={field} value={s.end} onChange={(e) => setS({ ...s, end: e.target.value })} /></div>
        <div><label htmlFor="av-tz" className={lab}>Time zone</label><select id="av-tz" className={field} value={s.tz} onChange={(e) => setS({ ...s, tz: e.target.value })}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select></div>
        <div><label htmlFor="av-kind" className={lab}>Type</label><select id="av-kind" className={field} value={s.kind} onChange={(e) => setS({ ...s, kind: e.target.value })}><option value="on_site">On site (client location)</option><option value="studio">Studio</option><option value="online">Online</option></select></div>
        <div className="sm:col-span-2"><label htmlFor="av-place" className={lab}>Place (optional for a check)</label><input id="av-place" className={field} value={s.place} onChange={(e) => setS({ ...s, place: e.target.value })} /></div>
      </div>

      <fieldset className="rounded-lg border border-black/10 p-3 space-y-2">
        <legend className="px-1 font-sans text-caption font-semibold text-ordift-ink">Did you check directly with the person? (optional; needed for “Available”)</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><label htmlFor="av-method" className={lab}>How you checked</label><select id="av-method" className={field} value={v.method} onChange={(e) => setV({ ...v, method: e.target.value })}><option value="">Not checked</option><option value="call">Phone or video call</option><option value="direct_message">Direct message</option><option value="in_person">In person</option><option value="email">Email</option></select></div>
          <div><label htmlFor="av-on" className={lab}>Date you checked</label><input id="av-on" type="date" className={field} value={v.on} onChange={(e) => setV({ ...v, on: e.target.value })} /></div>
          <div><label htmlFor="av-ref" className={lab}>Where it is recorded</label><input id="av-ref" className={field} value={v.ref} onChange={(e) => setV({ ...v, ref: e.target.value })} /></div>
        </div>
        <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink"><input type="checkbox" className="mt-1" checked={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.checked })} /> I checked directly with the assigned person.</label>
      </fieldset>

      <button type="button" onClick={submit} disabled={pending} className="min-h-11 px-5 rounded-full bg-ordift-ink text-white font-sans text-body-small disabled:opacity-50">{pending ? "Checking…" : "Check availability"}</button>

      <div aria-live="polite">
        {result && !result.ok ? <p role="alert" className="font-sans text-body-small text-red-700">{result.error}</p> : null}
        {result && result.ok ? (
          <div className={`rounded-lg border p-4 space-y-2 ${STYLE[result.state].box}`} data-state={result.state}>
            <p className="font-sans text-body font-semibold"><span aria-hidden>{STYLE[result.state].icon} </span>{STATE_LABEL[result.state]}</p>
            <p className="font-sans text-caption">{STATE_MEANING[result.state]}</p>
            <ul className="list-disc pl-5 font-sans text-body-small">{result.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            {result.conflicts.length > 0 ? <ul className="list-disc pl-5 font-sans text-body-small">{result.conflicts.map((c) => <li key={`${c.kind}${c.from}${c.label}`}>{c.firm ? "Firm" : "Possible clash"}: {c.label} ({c.from.slice(0, 16).replace("T", " ")} to {c.to.slice(0, 16).replace("T", " ")})</li>)}</ul> : null}
            <p className="font-sans text-caption">{NOT_A_RESERVATION}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
