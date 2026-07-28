"use client";

import { useState, useTransition } from "react";
import type { MemberClassification } from "@/lib/portal/memberNumbers";
import { addClassificationAction, updateClassificationAction, toggleClassificationAction } from "./classificationActions";

// Super-Admin-only CRUD for Member Number classifications (migration
// 0019) — the "any authorized admin can create new categories without
// a code change" requirement. Client component (unlike the simpler
// LookupTable in page.tsx) because inline editing needs per-row toggle
// state; the plain name+active toggle pattern used for Operational
// Titles/Engagement Types doesn't have enough fields (prefix, padding)
// to stay a bare server-rendered form.
export default function ClassificationManager({ classifications }: { classifications: MemberClassification[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrefix, setEditPrefix] = useState("");
  const [editPadding, setEditPadding] = useState(4);

  const [newName, setNewName] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  const [newPadding, setNewPadding] = useState(4);
  const [newStart, setNewStart] = useState(1);

  function beginEdit(c: MemberClassification) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditPrefix(c.prefix);
    setEditPadding(c.numberPadding);
    setError(null);
  }

  function saveEdit() {
    setError(null);
    const fd = new FormData();
    fd.set("id", editingId ?? "");
    fd.set("name", editName);
    fd.set("prefix", editPrefix);
    fd.set("numberPadding", String(editPadding));
    startTransition(async () => {
      const result = await updateClassificationAction(fd);
      if (result.error) setError(result.error);
      else setEditingId(null);
    });
  }

  function toggleActive(c: MemberClassification) {
    const fd = new FormData();
    fd.set("id", c.id);
    fd.set("active", String(c.active));
    startTransition(() => toggleClassificationAction(fd));
  }

  function addNew() {
    setError(null);
    const fd = new FormData();
    fd.set("name", newName);
    fd.set("prefix", newPrefix);
    fd.set("numberPadding", String(newPadding));
    fd.set("startingNumber", String(newStart));
    startTransition(async () => {
      const result = await addClassificationAction(fd);
      if (result.error) setError(result.error);
      else {
        setNewName("");
        setNewPrefix("");
        setNewPadding(4);
        setNewStart(1);
      }
    });
  }

  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4 md:col-span-2">
      <h2 className="font-serif font-medium text-body text-ordift-ink">Account Classifications &amp; Member Numbers</h2>
      <p className="font-sans text-body-small text-ordift-ink-muted max-w-2xl">
        Each classification gets its own independent, never-resetting number sequence. A Member Number changes only
        when a person&apos;s classification changes — never for a Title, Department, or Grade edit. Editing a prefix
        or digit count here only affects numbers generated after the change; anything already issued keeps its
        original number.
      </p>
      {error && <p className="font-sans text-caption text-red-700">{error}</p>}

      <ul className="divide-y divide-black/5">
        {classifications.map((c) => (
          <li key={c.id} className="py-3">
            {editingId === c.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Name"
                  className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small w-40"
                />
                <input
                  value={editPrefix}
                  onChange={(e) => setEditPrefix(e.target.value.toUpperCase())}
                  placeholder="Prefix (blank = none)"
                  className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small w-32"
                />
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={editPadding}
                  onChange={(e) => setEditPadding(Number(e.target.value))}
                  className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small w-20"
                />
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={pending || !editName}
                  className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="font-sans text-caption text-ordift-ink-muted underline underline-offset-4"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className={`font-sans text-body-small ${c.active ? "text-ordift-ink" : "text-ordift-ink-muted line-through"}`}>
                  {c.name}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-ordift-offwhite font-sans text-caption text-ordift-ink-muted">
                  {c.prefix ? `${c.prefix}${"#".repeat(c.numberPadding)}` : "no prefix — numeric only"}
                </span>
                <div className="ml-auto flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => beginEdit(c)}
                    className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(c)}
                    disabled={pending}
                    className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4 disabled:opacity-50"
                  >
                    {c.active ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {classifications.length === 0 && <p className="font-sans text-body-small text-ordift-ink-muted py-2">None yet.</p>}
      </ul>

      <div className="flex flex-wrap items-end gap-2 pt-3 border-t border-black/5">
        <label className="flex flex-col gap-1">
          <span className="font-sans text-caption text-ordift-ink-muted">Name</span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Speaker"
            className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small w-40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-sans text-caption text-ordift-ink-muted">Prefix</span>
          <input
            value={newPrefix}
            onChange={(e) => setNewPrefix(e.target.value.toUpperCase())}
            placeholder="e.g. SP (blank = none)"
            className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small w-32"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-sans text-caption text-ordift-ink-muted">Digits</span>
          <input
            type="number"
            min={1}
            max={10}
            value={newPadding}
            onChange={(e) => setNewPadding(Number(e.target.value))}
            className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small w-20"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-sans text-caption text-ordift-ink-muted">Starts at</span>
          <input
            type="number"
            min={1}
            value={newStart}
            onChange={(e) => setNewStart(Number(e.target.value))}
            className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small w-24"
          />
        </label>
        <button
          type="button"
          onClick={addNew}
          disabled={pending || !newName}
          className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50"
        >
          Add Classification
        </button>
      </div>
    </section>
  );
}
