"use client";

import { useEffect, useState } from "react";
import { SAMPLE_RATE_CARD } from "@/lib/pdf/rateCard/sample";
import type { RateCardContent } from "@/lib/pdf/rateCard/types";
import RateCardEditor from "@/lib/pdf/rateCard/ui/RateCardEditor";

const KEY = "ordift-rate-card-draft-v2";
const COVER = "/pdf/cover-placeholder.jpg";

// LOCAL DEVELOPMENT ONLY (never reachable in a production build — see src/app/dev/layout.tsx): the editor with placeholder content, stored in this browser only.
export default function RateCardWorkspace() {
  const [draft, setDraft] = useState<RateCardContent>({ ...SAMPLE_RATE_CARD, coverImage: COVER });
  // Restoring a locally saved draft after hydration is the one place a state update inside an effect is intended (browser storage does not exist on the server).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { try { const s = localStorage.getItem(KEY); if (s) setDraft(JSON.parse(s)); } catch { /* storage unavailable: start from the sample */ } }, []);
  const save = (d: RateCardContent) => { setDraft(d); try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ } };
  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Rate card — local editor (placeholder content)</h1>
      <p style={{ color: "#555", marginTop: 0 }}>Development only. Nothing is saved to a server; approval is only available on the admin page.</p>
      <RateCardEditor content={draft} onChange={save} readOnly={false} status={{ state: "draft" }} today={new Date().toISOString().slice(0, 10)} filename="Ordift-Studios-Rate-Card-DRAFT-local.pdf"
        toolbar={<button style={{ padding: "8px 14px", border: 0, borderRadius: 5, background: "#e8e4d9", font: "inherit", fontWeight: 600, cursor: "pointer" }} onClick={() => save({ ...SAMPLE_RATE_CARD, coverImage: COVER })}>Reset to sample</button>} />
    </main>
  );
}
