"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteDiscountCodeAction } from "./actions";

// Discount Lifecycle Refinement (2026-09-07) — type-to-confirm delete,
// same established pattern as admin/portfolio/DeleteProjectButton.tsx
// (the codebase's one other genuinely destructive, irreversible admin
// action): the button is disabled until the Admin retypes the exact
// code, so this can never be a one-click accident. Unlike the
// portfolio delete, the server action here can also come back with
// outcome "archived" rather than "deleted" — a discount with
// redemption history is never physically deleted, it's retired
// instead — so this component surfaces whichever actually happened.
export default function DeleteDiscountButton({ id, code, redemptionCount }: { id: string; code: string; redemptionCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"deleted" | "archived" | null>(null);

  if (result === "deleted") {
    return <span className="font-sans text-caption text-ordift-ink-muted">Deleted.</span>;
  }
  if (result === "archived") {
    return <span className="font-sans text-caption text-ordift-ink-muted">Archived — redemption history protected this code from permanent deletion.</span>;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="font-sans text-caption text-red-700 underline underline-offset-4">
        Delete
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
      <p className="font-sans text-body-small text-red-800">
        {redemptionCount > 0
          ? `"${code}" has ${redemptionCount} redemption${redemptionCount === 1 ? "" : "s"} on record — it cannot be permanently deleted without destroying that history. Confirming below will archive/retire it instead: it becomes inactive, hidden from normal use, and cannot be reactivated, but every historical redemption record stays intact.`
          : `This permanently deletes the "${code}" discount code — this cannot be undone. It has zero redemptions on record, so no financial/audit history is affected.`}
        {" "}Type the code to confirm.
      </p>
      <input
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={code}
        className="w-full rounded-lg border border-red-300 px-3 py-2 font-sans text-body-small"
      />
      {error && <p className="font-sans text-caption text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={confirmText !== code || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const res = await deleteDiscountCodeAction(id);
            if (res.ok) {
              setResult(res.outcome);
              router.refresh();
            } else {
              setError(res.error);
              setBusy(false);
            }
          }}
          className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-red-700 text-white disabled:opacity-40"
        >
          {busy ? "Working…" : redemptionCount > 0 ? "Archive (cannot delete)" : "Permanently Delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirmText("");
            setError(null);
          }}
          className="font-sans text-body-small font-medium px-4 py-2 rounded-md border border-black/15"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
