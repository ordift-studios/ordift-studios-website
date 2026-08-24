"use client";

import { useActionState } from "react";
import { transitionPulseArticleAction, type TransitionState } from "../actions";
import type { PulseArticleAction } from "@/lib/content/sanity/pulseAdmin";

// Same useActionState Saving…/Saved/error pattern established across
// this Admin Platform (StatusUpdateForm.tsx, PublicProfileForm.tsx) —
// one button per action rather than a dropdown, since each action here
// has materially different consequences (Publish is irreversible-ish in
// a way Reject/Archive/Restore aren't) and deserves its own explicit
// click rather than a select-then-submit that's easy to fat-finger.
function ActionButton({ articleId, action, label, tone }: { articleId: string; action: PulseArticleAction; label: string; tone: "primary" | "neutral" | "danger" }) {
  const [state, formAction, pending] = useActionState<TransitionState, FormData>(transitionPulseArticleAction, null);

  const toneClass =
    tone === "primary"
      ? "bg-ordift-navy-950 text-white"
      : tone === "danger"
        ? "border border-red-300 text-red-700 hover:bg-red-50"
        : "border border-black/15 text-ordift-ink hover:border-black/30";

  return (
    <form action={formAction}>
      <input type="hidden" name="articleId" value={articleId} />
      <input type="hidden" name="action" value={action} />
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className={`min-h-10 px-4 rounded-md font-sans text-body-small font-semibold disabled:opacity-60 ${toneClass}`}
      >
        {pending ? "Saving…" : label}
      </button>
      {!pending && state?.ok === true && <p className="mt-1 font-sans text-caption text-green-700">Done</p>}
      {state?.ok === false && <p className="mt-1 font-sans text-caption text-red-700 max-w-sm">{state.error}</p>}
    </form>
  );
}

export function ArticleActions({ articleId, status, isRejected }: { articleId: string; status: string; isRejected: boolean }) {
  if (status === "published") {
    return <ArticleActionsRow><ActionButton articleId={articleId} action="archive" label="Archive" tone="neutral" /></ArticleActionsRow>;
  }
  if (status === "archived") {
    return <p className="font-sans text-body-small text-ordift-ink-muted">Archived — no further action needed here.</p>;
  }
  return (
    <ArticleActionsRow>
      <ActionButton articleId={articleId} action="publish" label="Publish" tone="primary" />
      {isRejected ? (
        <ActionButton articleId={articleId} action="restore" label="Restore to Incoming" tone="neutral" />
      ) : (
        <ActionButton articleId={articleId} action="reject" label="Reject" tone="danger" />
      )}
      <ActionButton articleId={articleId} action="archive" label="Archive" tone="neutral" />
    </ArticleActionsRow>
  );
}

function ArticleActionsRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-start gap-4">{children}</div>;
}
