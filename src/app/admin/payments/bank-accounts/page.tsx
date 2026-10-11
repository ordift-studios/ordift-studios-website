import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { hasCapability } from "@/lib/workflow/engine";
import { PAYMENT_CAPABILITIES } from "@/lib/payments/paymentPermissions";
import { listBankAccounts, listMarketConfigs, type BankAccountRecord } from "@/lib/payments/bankAccountsAdmin";
import { listActiveCurrencies } from "@/lib/payments/currency";
import ActionForm from "@/components/admin/ActionForm";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import SubmitButton from "@/components/admin/SubmitButton";
import LocalTime from "@/components/admin/LocalTime";
import { activateBankAccountAction, createBankAccountAction, deactivateBankAccountAction, setDefaultBankAccountAction, setMarketPaymentsAction, updateBankAccountAction } from "./actions";

export const metadata: Metadata = { title: "Bank Accounts — Ordift Studios Admin", robots: { index: false, follow: false } };

const field = "w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";
const lbl = "block font-sans text-caption text-ordift-ink-muted mb-1";
const btn = "min-h-9 rounded-lg border border-black/20 px-4 font-sans text-body-small text-ordift-ink hover:bg-black/5";
const gold = "min-h-9 rounded-lg bg-ordift-gold px-4 font-sans text-body-small font-medium text-ordift-navy-950 hover:bg-ordift-gold-hover";

function AccountFields({ a, currencies }: { a?: BankAccountRecord; currencies: { code: string; name: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div><label className={lbl}>Bank name</label><input name="bankName" required defaultValue={a?.bankName} className={field} /></div>
      <div><label className={lbl}>Beneficiary legal name (exactly as the bank holds it)</label><input name="beneficiaryName" required defaultValue={a?.beneficiaryName} className={field} /></div>
      <div><label className={lbl}>IBAN</label><input name="iban" defaultValue={a?.iban ?? ""} className={`${field} font-mono`} autoComplete="off" /></div>
      <div><label className={lbl}>Account number (if no IBAN)</label><input name="accountNumber" defaultValue={a && a.accountNumber !== a.iban ? a.accountNumber : ""} className={`${field} font-mono`} autoComplete="off" /></div>
      <div><label className={lbl}>SWIFT / BIC</label><input name="swiftCode" defaultValue={a?.swiftCode ?? ""} className={`${field} font-mono`} /></div>
      <div>
        <label className={lbl}>Account currency</label>
        <select name="currencyCode" required defaultValue={a?.currencyCode ?? ""} className={field}>
          <option value="" disabled>Choose…</option>
          {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
        </select>
      </div>
      <div>
        <label className={lbl}>Market / country</label>
        <select name="country" required defaultValue={a?.country ?? ""} className={field}>
          <option value="" disabled>Choose…</option>
          <option value="QA">Qatar (QA)</option>
          <option value="GH">Ghana (GH)</option>
        </select>
      </div>
      <div>
        <label className={lbl}>Account classification</label>
        <select name="classification" required defaultValue={a?.classification ?? ""} className={field}>
          <option value="" disabled>Choose…</option>
          <option value="corporate">Corporate (Ordift Studios)</option>
          <option value="personal">Personal</option>
        </select>
      </div>
    </div>
  );
}

export default async function BankAccountsPage() {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user) || !hasCapability(user, PAYMENT_CAPABILITIES, "manage_bank_accounts")) redirect("/admin/payments");
  const [accounts, markets, currencies] = await Promise.all([listBankAccounts(), listMarketConfigs(), listActiveCurrencies()]);

  return (
    <div className="max-w-5xl space-y-10">
      <div>
        <Link href="/admin/payments" className="font-sans text-body-small text-ordift-ink-muted hover:text-ordift-ink mb-4 inline-block">← Back to Payments</Link>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Finance</p>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">Bank Accounts</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Where clients are told to send Direct Bank Transfers. Super Admin only. New accounts are saved <strong>inactive</strong> and receive nothing until you activate them with a recorded basis. Each payment keeps the account details it was issued with, so changing or deactivating an account never alters past records.
        </p>
      </div>

      <section>
        <h2 className="font-serif font-medium text-lg text-ordift-ink mb-3">Markets</h2>
        <div className="space-y-2">
          {markets.map((m) => (
            <div key={m.country} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-4">
              <p className="font-sans text-body-small text-ordift-ink"><strong>{m.country}</strong> · {m.currency} · {m.provider === "bank_transfer" ? "Direct Bank Transfer only" : m.provider} · <span className={m.isActive ? "text-green-700" : "text-ordift-ink-muted"}>{m.isActive ? "Enabled" : "Not enabled"}</span></p>
              {m.country !== "GH" && (
                <ActionForm action={setMarketPaymentsAction} className="flex items-center gap-2">
                  <input type="hidden" name="country" value={m.country} />
                  <input type="hidden" name="enabled" value={String(!m.isActive)} />
                  <ConfirmSubmitButton confirmMessage={m.isActive ? "Disable this market? Clients will no longer be offered Pay Now here." : "Enable this market? Clients whose payment market is set to it can be offered Pay Now once an active default account and exchange rate exist."} pendingLabel="Saving…" className={btn}>{m.isActive ? "Disable market" : "Enable market"}</ConfirmSubmitButton>
                </ActionForm>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-serif font-medium text-lg text-ordift-ink">Receiving accounts</h2>
        {accounts.length === 0 && <p className="font-sans text-body-small text-ordift-ink-muted">No accounts yet.</p>}
        {accounts.map((a) => (
          <article key={a.id} className="rounded-xl border border-black/10 bg-white p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-sans text-body font-medium text-ordift-ink">{a.bankName} — {a.beneficiaryName}</h3>
              <span className={`rounded-full border px-2.5 py-0.5 font-sans text-caption ${a.isActive ? "border-green-200 bg-green-50 text-green-800" : "border-black/10 bg-black/5 text-ordift-ink-muted"}`}>{a.isActive ? "Active" : "Inactive"}</span>
              {a.isDefault && <span className="rounded-full border border-ordift-gold/50 bg-ordift-gold/15 px-2.5 py-0.5 font-sans text-caption text-ordift-ink">Default for {a.country}</span>}
              <span className={`rounded-full border px-2.5 py-0.5 font-sans text-caption ${a.classification === "personal" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-black/10 text-ordift-ink-muted"}`}>{a.classification === "personal" ? "Personal account" : "Corporate account"}</span>
            </div>
            <p className="font-sans text-caption text-ordift-ink-muted font-mono">{a.country} · {a.currencyCode} · {a.iban ? `IBAN ${a.iban}` : `Account ${a.accountNumber}`}{a.swiftCode ? ` · ${a.swiftCode}` : ""}</p>
            {a.isActive && a.activationConfirmedAt && (
              <p className="font-sans text-caption text-ordift-ink-muted">Activated <LocalTime iso={a.activationConfirmedAt} /> — basis: “{a.activationBasis}”</p>
            )}
            {!a.isActive && a.deactivatedAt && <p className="font-sans text-caption text-ordift-ink-muted">Deactivated <LocalTime iso={a.deactivatedAt} />.</p>}

            <div className="flex flex-wrap gap-3 pt-1">
              {a.isActive && !a.isDefault && (
                <ActionForm action={setDefaultBankAccountAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <ConfirmSubmitButton confirmMessage={`Make this the default ${a.country} receiving account for NEW payments? Earlier payments keep the account they were issued with.`} pendingLabel="Saving…" className={btn}>Make default</ConfirmSubmitButton>
                </ActionForm>
              )}
              {a.isActive && (
                <ActionForm action={deactivateBankAccountAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={a.id} />
                  <div><label className={lbl}>Reason for deactivating</label><input name="reason" required minLength={5} className={`${field} w-64`} /></div>
                  <ConfirmSubmitButton confirmMessage="Deactivate this account? New payments will no longer be directed to it. Historical payments are not affected." pendingLabel="Saving…" className={btn}>Deactivate</ConfirmSubmitButton>
                </ActionForm>
              )}
            </div>

            {!a.isActive && (
              <details className="rounded-lg border border-black/10 p-3">
                <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink">Edit details</summary>
                <ActionForm action={updateBankAccountAction} className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={a.id} />
                  <AccountFields a={a} currencies={currencies} />
                  <SubmitButton pendingLabel="Saving…" className={btn}>Save changes</SubmitButton>
                </ActionForm>
              </details>
            )}

            {!a.isActive && (
              <details className="rounded-lg border border-ordift-gold/40 p-3">
                <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink">Activate as a live receiving account…</summary>
                <ActionForm action={activateBankAccountAction} className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={a.id} />
                  <p className="font-sans text-caption text-ordift-ink-muted max-w-2xl">
                    Activating means real clients will be told to send real money to this account. Record who has confirmed it is permitted for this use and how (at least a sentence). This is kept permanently with the account.
                  </p>
                  <div><label className={lbl}>Basis for activation (required)</label><textarea name="basis" required minLength={20} rows={3} className={field} placeholder="e.g. Confirmed in writing by the bank on <date> that personal-account receipts for business services are permitted for …" /></div>
                  {a.classification === "personal" && (
                    <label className="flex items-start gap-2 font-sans text-body-small text-ordift-ink">
                      <input type="checkbox" name="confirmedPersonalUse" required className="mt-1" />
                      <span>I confirm this is a personal account and that the bank and applicable regulation permit it to receive business payments. I accept responsibility for this decision.</span>
                    </label>
                  )}
                  <label className="flex items-center gap-2 font-sans text-body-small text-ordift-ink"><input type="checkbox" name="makeDefault" defaultChecked /> Make this the default account for {a.country}</label>
                  <ConfirmSubmitButton confirmMessage="Activate this account as a LIVE receiving account? This is recorded with your name and the basis you entered." pendingLabel="Activating…" className={gold}>Activate account</ConfirmSubmitButton>
                </ActionForm>
              </details>
            )}
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-5">
        <h2 className="font-serif font-medium text-lg text-ordift-ink mb-1">Add a bank account</h2>
        <p className="font-sans text-caption text-ordift-ink-muted mb-4 max-w-2xl">Saved inactive. Enter the details yourself here — never share bank passwords, PINs, OTPs or online-banking logins with anyone, including this system.</p>
        <ActionForm action={createBankAccountAction} className="space-y-3">
          <AccountFields currencies={currencies} />
          <SubmitButton pendingLabel="Saving…" className={gold}>Save as inactive</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
