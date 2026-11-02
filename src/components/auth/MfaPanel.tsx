"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { beginEnrolment, cancelEnrolment, confirmEnrolment, listFactors, removeFactor, stepUp, type Factor } from "@/lib/auth/mfaClient";

// Authenticator-app (TOTP) setup for administrators. Everything happens in the browser against the authentication service as the signed-in person. The QR code and the optional setup key are shown only to the person
// enrolling, are kept in this component's state only until the setup is confirmed or cancelled, and are never logged, stored or sent to this site's servers.
const input = "rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small";
const btn = "rounded-md border border-black/20 px-3 py-1.5 font-sans text-caption";

export function MfaPanel() {
  const [verified, setVerified] = useState<Factor[] | null>(null);
  const [unfinished, setUnfinished] = useState<Factor[]>([]);
  const [setup, setSetup] = useState<{ factorId: string; qrCode: string; setupKey: string } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [removeCode, setRemoveCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const r = await listFactors(createClient());
    if (r.ok) { setVerified(r.verified); setUnfinished(r.unfinished); } else setMsg({ ok: false, text: r.error });
  }, []);
  useEffect(() => { const t = setTimeout(() => void refresh(), 0); return () => clearTimeout(t); }, [refresh]);

  const clearSetup = () => { setSetup(null); setShowKey(false); setCode(""); setName(""); };

  async function start(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    for (const u of unfinished) await cancelEnrolment(createClient(), u.id);   // an abandoned earlier attempt never lingers
    const r = await beginEnrolment(createClient(), name);
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); await refresh(); return; }
    setSetup({ factorId: r.factorId, qrCode: r.qrCode, setupKey: r.setupKey });
  }
  async function confirm(e: React.FormEvent) {
    e.preventDefault(); if (!setup) return; setBusy(true); setMsg(null);
    const r = await confirmEnrolment(createClient(), setup.factorId, code);
    setBusy(false); setCode("");
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    clearSetup(); setMsg({ ok: true, text: "Authenticator app added. Add a second device as a backup if you can." }); await refresh();
  }
  async function cancel() { if (setup) await cancelEnrolment(createClient(), setup.factorId); clearSetup(); await refresh(); }
  async function remove(id: string) {
    setBusy(true); setMsg(null);
    const s = await stepUp(createClient(), removeCode); setRemoveCode("");
    if (!s.ok) { setBusy(false); setMsg({ ok: false, text: s.error }); return; }
    const r = await removeFactor(createClient(), id);
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "Authenticator app removed." } : { ok: false, text: r.error });
    await refresh();
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="mfa-have" className="space-y-2">
        <h2 id="mfa-have" className="font-serif font-medium text-body text-ordift-ink">Your authenticator apps</h2>
        {verified === null ? <p className="font-sans text-caption text-ordift-ink-muted" role="status">Loading…</p> : verified.length === 0 ? (
          <p className="font-sans text-body-small text-amber-900">None yet. Irreversible actions (erasing permission details, purging logs, changing the retention policy) stay locked until you add one.</p>
        ) : (
          <>
            <ul className="divide-y divide-black/5 rounded-xl border border-black/10 bg-white">
              {verified.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 font-sans text-body-small"><span>{f.name} <span className="text-caption text-ordift-ink-muted">added {f.createdAt.slice(0, 10)}</span></span>
                  <span className="flex items-center gap-2"><label htmlFor={`rm-${f.id}`} className="sr-only">Code from another app to confirm removal</label>
                    <input id={`rm-${f.id}`} value={removeCode} onChange={(e) => setRemoveCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="6-digit code" className={`${input} w-32`} />
                    <button type="button" className={btn} disabled={busy} onClick={() => remove(f.id)}>Remove</button></span></li>))}
            </ul>
            {verified.length === 1 && <p className="font-sans text-caption text-amber-900">You have one app. If you lose that phone you will be locked out of irreversible actions until someone removes it for you. Add a second app on another device as a backup.</p>}
          </>
        )}
      </section>

      <section aria-labelledby="mfa-add" className="space-y-2">
        <h2 id="mfa-add" className="font-serif font-medium text-body text-ordift-ink">Add an authenticator app</h2>
        {!setup ? (
          <form onSubmit={start} className="flex flex-wrap items-end gap-2">
            <label htmlFor="mfa-name" className="font-sans text-caption text-ordift-ink-muted">Name for this device<input id="mfa-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Work phone" className={`${input} mt-1 block`} /></label>
            <button className={btn} disabled={busy}>Start setup</button>
          </form>
        ) : (
          <div className="space-y-2">
            <p className="font-sans text-body-small text-ordift-ink">Scan this code with an authenticator app (such as Google Authenticator, Microsoft Authenticator or 1Password), then enter the 6-digit code it shows.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qrCode} alt="QR code to add your Ordift Studios account to an authenticator app" width={192} height={192} className="rounded-lg border border-black/10 bg-white p-2" />
            <div>{showKey ? <p className="break-all font-mono text-caption text-ordift-ink" aria-live="polite">Setup key: {setup.setupKey}</p> : <button type="button" className="font-sans text-caption underline" onClick={() => setShowKey(true)}>Cannot scan? Show the setup key</button>}</div>
            <form onSubmit={confirm} className="flex flex-wrap items-end gap-2">
              <label htmlFor="mfa-code" className="font-sans text-caption text-ordift-ink-muted">6-digit code<input id="mfa-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={8} className={`${input} mt-1 block w-32`} /></label>
              <button className={btn} disabled={busy}>Confirm</button><button type="button" className={btn} disabled={busy} onClick={cancel}>Cancel</button>
            </form>
          </div>
        )}
      </section>

      {msg && <p role={msg.ok ? "status" : "alert"} className={`font-sans text-caption ${msg.ok ? "text-green-800" : "text-red-800"}`}>{msg.text}</p>}

      <section aria-labelledby="mfa-lost" className="space-y-1 rounded-xl border border-black/10 bg-white p-4">
        <h2 id="mfa-lost" className="font-serif font-medium text-body text-ordift-ink">If you lose your device</h2>
        <ul className="list-disc pl-5 font-sans text-body-small text-ordift-ink">
          <li>Normal sign-in and day-to-day work are not affected. Only irreversible actions are locked.</li>
          <li>If you have a second app, use it, then remove the lost one here.</li>
          <li>If you have no other app, the other super administrator can ask the platform owner to remove your lost app from the authentication service after confirming who you are by another route (a call or in person). They must record the date, the reason and who asked. Then set up a new app and add a backup.</li>
          <li>Nobody sees or stores your codes or setup keys. There are no recovery codes to lose or leak.</li>
        </ul>
      </section>
    </div>
  );
}
