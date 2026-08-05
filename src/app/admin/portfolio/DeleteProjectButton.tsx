"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deletePortfolioProjectAction } from "./actions";

// Type-to-confirm delete (2026-08-05) — the one genuinely destructive,
// irreversible action in the Portfolio Management System, so it gets a
// harder confirmation than a plain confirm() dialog: the user must
// retype the project's title before the button is even clickable.
export default function DeleteProjectButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-sans text-caption text-red-700 underline underline-offset-4"
      >
        Delete Project
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
      <p className="font-sans text-body-small text-red-800">
        This permanently deletes &ldquo;{title}&rdquo; from Sanity — this cannot be undone. Type the project title to
        confirm.
      </p>
      <input
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={title}
        className="w-full rounded-lg border border-red-300 px-3 py-2 font-sans text-body-small"
      />
      {error && <p className="font-sans text-caption text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={confirmText !== title || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const result = await deletePortfolioProjectAction(id, title);
            if (result.ok) {
              router.push("/admin/portfolio");
            } else {
              setError(result.error);
              setBusy(false);
            }
          }}
          className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-red-700 text-white disabled:opacity-40"
        >
          {busy ? "Deleting…" : "Permanently Delete"}
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
