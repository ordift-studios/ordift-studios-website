"use client";

import { useActionState, useState } from "react";
import { updateApplicationStatusAction, getRecruitmentFileUrlAction, type UpdateStatusState } from "../actions";
import { RECRUITMENT_STATUSES, RECRUITMENT_STATUS_LABEL, type RecruitmentStatus } from "@/lib/recruitment/types";

// Same useActionState Saving…/Saved/error pattern established for
// Meet the Team's Public Profile save (PublicProfileForm.tsx) — kept
// consistent rather than inventing a third feedback style.
export function StatusUpdateForm({ applicationId, currentStatus }: { applicationId: string; currentStatus: RecruitmentStatus }) {
  const [state, formAction, pending] = useActionState<UpdateStatusState, FormData>(updateApplicationStatusAction, null);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="applicationId" value={applicationId} />
      <select
        name="status"
        defaultValue={currentStatus}
        disabled={pending}
        className="min-h-10 rounded-md border border-black/15 px-3 font-sans text-body-small bg-white disabled:opacity-60"
      >
        {RECRUITMENT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {RECRUITMENT_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="min-h-10 px-4 rounded-md bg-ordift-navy-950 text-white font-sans text-body-small font-semibold disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save Status"}
      </button>
      {!pending && state?.ok === true && <span className="font-sans text-body-small text-green-700">Saved</span>}
      {state?.ok === false && <span className="font-sans text-body-small text-red-700">{state.error}</span>}
    </form>
  );
}

// Signed-URL-on-click for the photo/CV — never a stored/rendered link,
// so a signed URL is only ever generated at the moment an authorized
// viewer actually asks for it.
export function FileLinkButton({ applicationId, file, label }: { applicationId: string; file: "photo" | "cv"; label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const result = await getRecruitmentFileUrlAction(applicationId, file);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="min-h-10 px-4 rounded-md border border-ordift-gold text-ordift-gold-pressed font-sans text-body-small font-semibold hover:bg-ordift-gold/10 disabled:opacity-60"
      >
        {loading ? "Preparing…" : label}
      </button>
      {error && <p className="font-sans text-caption text-red-700 mt-1">{error}</p>}
    </div>
  );
}
