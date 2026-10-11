"use client";

import { useState } from "react";
import { reviewFileDownloadUrlAction } from "./releaseActions";

export default function ReviewFileLink({ fileId, label }: { fileId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function open() {
    setBusy(true);
    setError(null);
    const r = await reviewFileDownloadUrlAction(fileId);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    window.open(r.url, "_blank", "noopener,noreferrer");
  }
  return (
    <span>
      <button type="button" onClick={() => void open()} disabled={busy} className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4 disabled:opacity-50">{busy ? "Opening…" : label}</button>
      {error && <span role="alert" className="ml-2 font-sans text-caption text-red-800">{error}</span>}
    </span>
  );
}
