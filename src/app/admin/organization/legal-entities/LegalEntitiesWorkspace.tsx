"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createEmployingEntityAction, setEmployingEntityActiveAction, verifyEmployingEntityAction, setEmployingEntityEmployerCapableAction, type ActionState } from "./actions";

export interface EntityView {
  id: string;
  name: string;
  legalName: string | null;
  tradingName: string | null;
  jurisdictionName: string | null;
  registrationType: string | null;
  registrationDate: string | null;
  active: boolean;
  employerCapable: boolean;
  defaultCurrency: string | null;
  verificationStatus: string;
  staffCount: number;
}

export interface JurisdictionOption {
  id: string;
  name: string;
}

function VerifyForm({ entityId }: { entityId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(verifyEmployingEntityAction, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="entityId" value={entityId} />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Verifying…" : "Mark Verified"}
      </button>
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700 mt-1">{state.error}</p>}
    </form>
  );
}

function ActiveToggleForm({ entityId, active }: { entityId: string; active: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setEmployingEntityActiveAction, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="active" value={(!active).toString()} />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-gold-pressed text-ordift-navy-950 disabled:opacity-50">
        {pending ? "Saving…" : active ? "Mark Inactive" : "Mark Active"}
      </button>
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700 mt-1">{state.error}</p>}
    </form>
  );
}

function EmployerCapableToggleForm({ entityId, employerCapable }: { entityId: string; employerCapable: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setEmployingEntityEmployerCapableAction, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="employerCapable" value={(!employerCapable).toString()} />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-2 py-1 rounded-md border border-black/15 text-ordift-ink disabled:opacity-50">
        {pending ? "Saving…" : employerCapable ? "Mark Not Yet Employer-Capable" : "Mark Employer-Capable"}
      </button>
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700 mt-1">{state.error}</p>}
    </form>
  );
}

const VERIFICATION_STYLES: Record<string, string> = {
  verified: "bg-green-100 text-green-800",
  pending_review: "bg-amber-100 text-amber-800",
  unverified: "bg-black/5 text-ordift-ink-muted",
};

function EntityRow({ entity }: { entity: EntityView }) {
  return (
    <li className="rounded-lg border border-black/10 bg-white p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-sans text-body-small font-medium text-ordift-ink">
            <Link href={`/admin/organization/legal-entities/${entity.id}`} className="underline underline-offset-4">{entity.legalName ?? entity.name}</Link>
            {entity.tradingName && entity.tradingName !== entity.legalName ? ` (trading as ${entity.tradingName})` : ""}
          </p>
          <p className="font-sans text-caption text-ordift-ink-muted">
            {entity.jurisdictionName ?? "Jurisdiction not set"}
            {entity.registrationType ? ` · ${entity.registrationType}` : ""}
            {entity.registrationDate ? ` · registered ${entity.registrationDate}` : ""}
            {entity.defaultCurrency ? ` · ${entity.defaultCurrency}` : ""}
          </p>
          <p className="font-sans text-caption text-ordift-ink-muted">{entity.staffCount} staff currently assigned</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${entity.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
            {entity.active ? "Active" : "Inactive"}
          </span>
          <span className={`px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${VERIFICATION_STYLES[entity.verificationStatus] ?? "bg-black/5"}`}>
            {entity.verificationStatus.replace(/_/g, " ")}
          </span>
          <span className={`px-2 py-0.5 rounded-full font-sans text-caption whitespace-nowrap ${entity.employerCapable ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
            {entity.employerCapable ? "Employer-capable" : "Not yet employer-capable"}
          </span>
        </div>
      </div>
      {!entity.employerCapable && (
        <p className="font-sans text-caption text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Not selectable for any new employment record (Founder self-administration, Record Initial Employment Terms,
          Employment Transitions, Founder Direct Hire) until marked employer-capable.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <ActiveToggleForm entityId={entity.id} active={entity.active} />
        <EmployerCapableToggleForm entityId={entity.id} employerCapable={entity.employerCapable} />
        {entity.verificationStatus !== "verified" && <VerifyForm entityId={entity.id} />}
        <Link href={`/admin/organization/legal-entities/${entity.id}`} className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
          Registration details & evidence →
        </Link>
      </div>
    </li>
  );
}

function CreateEntityForm({ jurisdictionOptions }: { jurisdictionOptions: JurisdictionOption[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createEmployingEntityAction, null);
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input name="legalName" required placeholder="Legal name" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="tradingName" placeholder="Trading name (if different)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <select name="jurisdictionId" defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1.5 font-sans text-body-small">
        <option value="">Jurisdiction pending / not yet set</option>
        {jurisdictionOptions.map((j) => (
          <option key={j.id} value={j.id}>{j.name}</option>
        ))}
      </select>
      <input name="registrationType" placeholder="Registration type" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="registrationDate" type="date" aria-label="Registration date" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="effectiveFrom" type="date" aria-label="Effective from" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="defaultCurrency" placeholder="Default currency (e.g. GHS)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <label className="sm:col-span-2 flex items-center gap-2 font-sans text-caption text-ordift-ink-muted">
        <input type="checkbox" name="employerCapable" />
        Employer-capable now — leave unchecked if registration is still in progress; it can be marked capable later
        once genuinely complete, and will never appear in any employment selector until then.
      </label>
      <button type="submit" disabled={pending} className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Creating…" : "Register New Legal Entity"}
      </button>
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

export function LegalEntitiesWorkspace({ entities, jurisdictionOptions }: { entities: EntityView[]; jurisdictionOptions: JurisdictionOption[] }) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Registered Entities {entities.length > 0 ? `(${entities.length})` : ""}</h2>
        {entities.length > 0 ? (
          <ul className="space-y-3">
            {entities.map((e) => (
              <EntityRow key={e.id} entity={e} />
            ))}
          </ul>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No legal entities registered yet.</p>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Register a Future Entity</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">Use this once a new jurisdiction (e.g. Qatar) or additional Ordift entity has genuinely been registered — never before.</p>
        <CreateEntityForm jurisdictionOptions={jurisdictionOptions} />
      </section>
    </div>
  );
}
