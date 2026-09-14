"use client";

import { useActionState } from "react";
import { registerAssetAction, assignAssetAction, updateAssetStatusAction, type ActionState } from "./actions";

export interface CompanyAssetView {
  id: string;
  assetIdentifier: string;
  description: string;
  category: string | null;
  status: string;
  acknowledgementRequired: boolean;
}

const ASSET_STATUSES = ["in_stock", "under_repair", "retired", "disposed"] as const;

function AssignForm({ assetId, staffOptions }: { assetId: string; staffOptions: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(assignAssetAction, null);
  return (
    <form action={formAction} className="flex flex-wrap gap-2">
      <input type="hidden" name="assetId" value={assetId} />
      <select name="profileId" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
        <option value="" disabled>Assign to…</option>
        {staffOptions.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <input name="issueCondition" placeholder="Issue condition (optional)" className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption flex-1 min-w-[140px]" />
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Assigning…" : "Assign"}
      </button>
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700 basis-full">{state.error}</span>}
    </form>
  );
}

function StatusForm({ assetId, currentStatus }: { assetId: string; currentStatus: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateAssetStatusAction, null);
  return (
    <form action={formAction} className="flex flex-wrap gap-2">
      <input type="hidden" name="assetId" value={assetId} />
      <select name="status" required defaultValue="" className="rounded-lg border border-black/15 bg-white px-2 py-1 font-sans text-caption">
        <option value="" disabled>Update status…</option>
        {ASSET_STATUSES.filter((s) => s !== currentStatus).map((s) => (
          <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="font-sans text-caption font-semibold px-2 py-1 rounded-md bg-ordift-gold-pressed text-ordift-navy-950 disabled:opacity-50">
        {pending ? "Saving…" : "Update"}
      </button>
      {!pending && state?.ok === false && <span className="font-sans text-caption text-red-700 basis-full">{state.error}</span>}
    </form>
  );
}

function AssetRow({ asset, staffOptions }: { asset: CompanyAssetView; staffOptions: { id: string; name: string }[] }) {
  return (
    <li className="rounded-lg border border-black/10 bg-white p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-sans text-body-small font-medium text-ordift-ink">{asset.assetIdentifier} — {asset.description}</p>
          <p className="font-sans text-caption text-ordift-ink-muted">
            {asset.category ?? "Uncategorized"}{asset.acknowledgementRequired ? " · acknowledgement required" : ""}
          </p>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-sans text-caption whitespace-nowrap">{asset.status.replace(/_/g, " ")}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {asset.status === "in_stock" && <AssignForm assetId={asset.id} staffOptions={staffOptions} />}
        {asset.status !== "assigned" && <StatusForm assetId={asset.id} currentStatus={asset.status} />}
      </div>
    </li>
  );
}

function RegisterAssetForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(registerAssetAction, null);
  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input name="assetIdentifier" required placeholder="Asset identifier (e.g. serial number)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="category" placeholder="Category (optional)" className="rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <input name="description" required placeholder="Description" className="sm:col-span-2 rounded-lg border border-black/15 px-2 py-1.5 font-sans text-body-small" />
      <label className="sm:col-span-2 flex items-center gap-1 font-sans text-caption text-ordift-ink-muted">
        <input type="checkbox" name="acknowledgementRequired" value="true" /> Require assignee acknowledgement
      </label>
      <button type="submit" disabled={pending} className="sm:col-span-2 justify-self-start font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50">
        {pending ? "Registering…" : "Register Asset"}
      </button>
      {!pending && state?.ok === false && <p className="sm:col-span-2 font-sans text-caption text-red-700">{state.error}</p>}
    </form>
  );
}

export function AssetsWorkspace({ assets, staffOptions }: { assets: CompanyAssetView[]; staffOptions: { id: string; name: string }[] }) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Register a New Asset</h2>
        <RegisterAssetForm />
      </section>

      <section className="space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Registry {assets.length > 0 ? `(${assets.length})` : ""}</h2>
        {assets.length > 0 ? (
          <ul className="space-y-3">
            {assets.map((a) => (
              <AssetRow key={a.id} asset={a} staffOptions={staffOptions} />
            ))}
          </ul>
        ) : (
          <p className="font-sans text-body-small text-ordift-ink-muted">No assets registered yet.</p>
        )}
      </section>
    </div>
  );
}
