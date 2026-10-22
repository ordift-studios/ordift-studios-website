"use client";

import { useActionState, useEffect, useState } from "react";
import type { ActionState } from "@/lib/shared/actionState";
import { RATING_CATEGORIES, REMARKS_MAX, COMMENT_MAX, type DeliveryState } from "@/lib/portal/clientDelivery";

type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const CARD = "rounded-xl border border-black/10 bg-white p-5 sm:p-6";
const BTN_PRIMARY = "inline-flex items-center justify-center min-h-12 rounded-lg bg-ordift-gold px-5 font-sans text-body-small font-semibold text-ordift-ink hover:bg-ordift-gold-hover disabled:opacity-60 disabled:cursor-wait";
const BTN_OUTLINE = "inline-flex items-center justify-center min-h-12 rounded-lg border border-ordift-ink px-5 font-sans text-body-small font-medium text-ordift-ink hover:bg-ordift-offwhite disabled:opacity-60 disabled:cursor-wait";

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Result({ state }: { state: ActionState }) {
  if (!state) return null;
  return state.ok ? (
    <p role="status" className="mt-4 rounded-lg bg-ordift-offwhite px-4 py-3 font-sans text-body-small text-ordift-ink">{state.message}</p>
  ) : (
    <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 font-sans text-body-small text-red-800">{state.error}</p>
  );
}

// ---------------------------------------------------------------------------------------------- Download all
export function DownloadAllCard({ href, count, sizeText }: { href: string; count: number; sizeText: string }) {
  const [preparing, setPreparing] = useState(false);
  useEffect(() => {
    if (!preparing) return;
    const t = setTimeout(() => setPreparing(false), 45_000);
    return () => clearTimeout(t);
  }, [preparing]);
  return (
    <section aria-labelledby="download-all-heading" className={`${CARD} mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
      <div>
        <h2 id="download-all-heading" className="font-serif text-heading-4 text-ordift-ink">Download all your photographs</h2>
        <p className="mt-1 font-sans text-body-small text-ordift-ink-muted">
          {count} photograph{count === 1 ? "" : "s"} · about {sizeText} · one ZIP file, original quality.
        </p>
        {preparing && (
          <p role="status" className="mt-2 font-sans text-body-small text-ordift-ink">
            Preparing your download… it starts in a few seconds and larger sets can take a minute. Please keep this page open. If nothing downloads, tap the button again or use the individual Download buttons below.
          </p>
        )}
      </div>
      <a href={href} onClick={() => setPreparing(true)} className={BTN_PRIMARY} aria-busy={preparing}>
        {preparing ? "Preparing…" : `Download all (${count})`}
      </a>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------- Confirm your delivery
export function ConfirmDeliveryCard({ enquiryId, state, action, requestsHref }: { enquiryId: string; state: DeliveryState; action: FormAction; requestsHref?: string }) {
  const [result, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const [showCorrections, setShowCorrections] = useState(false);
  return (
    <section aria-labelledby="confirm-delivery-heading" className={`${CARD} mt-8`}>
      <h2 id="confirm-delivery-heading" className="font-serif text-heading-4 text-ordift-ink">Confirm your delivery</h2>
      <p className="mt-1 font-sans text-body-small text-ordift-ink-muted">
        Let us know how your photographs arrived. Receiving them and accepting them are separate — you can confirm you have them and still take your time to review.
      </p>

      <ul className="mt-4 space-y-1 font-sans text-body-small text-ordift-ink">
        {state.receipt && <li>✓ You confirmed you received your photographs on {fmt(state.receipt.at)}.</li>}
        {state.accepted && <li>✓ You reviewed and accepted this delivery on {fmt(state.accepted.at)}.</li>}
        {state.corrections && <li>• You asked for corrections on {fmt(state.corrections.at)}{state.corrections.remarks ? ` — “${state.corrections.remarks}”` : ""}.</li>}
        {state.staleSince && <li className="text-ordift-ink-muted">New photographs have been added since your last confirmation. Please confirm again below.</li>}
      </ul>

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="enquiryId" value={enquiryId} />
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button type="submit" name="kind" value="receipt" disabled={pending} className={BTN_OUTLINE}>
            I received my photographs
          </button>
          <button type="submit" name="kind" value="accept" disabled={pending} className={BTN_PRIMARY}>
            I have reviewed and accept the delivery
          </button>
          <button type="button" onClick={() => setShowCorrections((v) => !v)} aria-expanded={showCorrections} className={BTN_OUTLINE}>
            I need corrections
          </button>
        </div>

        {showCorrections && (
          <div className="rounded-lg bg-ordift-offwhite p-4 space-y-3">
            <label htmlFor="delivery-remarks" className="block font-sans text-body-small text-ordift-ink">
              What would you like us to look at? <span className="text-ordift-ink-muted">(optional)</span>
            </label>
            <textarea id="delivery-remarks" name="remarks" rows={3} maxLength={REMARKS_MAX} className="w-full rounded-lg border border-black/15 bg-white p-3 font-sans text-body-small text-ordift-ink" />
            <div className="flex flex-wrap items-center gap-4">
              <button type="submit" name="kind" value="corrections" disabled={pending} className={BTN_PRIMARY}>Send my request</button>
              {requestsHref && (
                <a href={`${requestsHref}?type=correction`} className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
                  Or ask about a specific photograph
                </a>
              )}
            </div>
            <p className="font-sans text-caption text-ordift-ink-muted">For a single photograph you can also use “Request a correction” under it above.</p>
          </div>
        )}
        <Result state={result} />
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------- Rate your experience
function RatingPicker({ name, label, emphasised }: { name: string; label: string; emphasised?: boolean }) {
  return (
    <fieldset className="space-y-2">
      <legend className={`font-sans ${emphasised ? "text-body font-medium" : "text-body-small"} text-ordift-ink`}>{label}</legend>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10" role="radiogroup" aria-label={label}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <label key={n} className="relative">
            <input type="radio" name={name} value={n} className="peer sr-only" />
            <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-black/15 bg-white font-sans text-body-small text-ordift-ink peer-checked:border-ordift-gold peer-checked:bg-ordift-gold peer-checked:font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-ordift-gold">
              {n}
            </span>
          </label>
        ))}
      </div>
      <div className="flex justify-between font-sans text-caption text-ordift-ink-muted"><span>1 = Very poor</span><span>5 = Average</span><span>10 = Excellent</span></div>
    </fieldset>
  );
}

export function RateExperienceCard({ enquiryId, action, alreadyRatedAt }: { enquiryId: string; action: FormAction; alreadyRatedAt: string | null }) {
  const [result, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const [skipped, setSkipped] = useState(false);
  if (skipped) return null;
  const overall = RATING_CATEGORIES.find((c) => c.key === "overall")!;
  const others = RATING_CATEGORIES.filter((c) => c.key !== "overall");
  return (
    <section aria-labelledby="rate-heading" className={`${CARD} mt-6`}>
      <h2 id="rate-heading" className="font-serif text-heading-4 text-ordift-ink">Rate your experience <span className="font-sans text-body-small text-ordift-ink-muted">(optional)</span></h2>
      <p className="mt-1 font-sans text-body-small text-ordift-ink-muted">Tap a number from 1 to 10. One overall rating is enough. Your answers are private to Ordift and are never published.</p>
      {alreadyRatedAt && <p className="mt-2 font-sans text-body-small text-ordift-ink">✓ You shared feedback on {fmt(alreadyRatedAt)}. You can send an update below.</p>}

      <form action={formAction} className="mt-5 space-y-5">
        <input type="hidden" name="enquiryId" value={enquiryId} />
        <RatingPicker name={overall.key} label={overall.label} emphasised />
        <details className="rounded-lg bg-ordift-offwhite p-4">
          <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink">Rate more areas (optional)</summary>
          <div className="mt-4 space-y-5">
            {others.map((c) => <RatingPicker key={c.key} name={c.key} label={c.label} />)}
          </div>
        </details>
        <div>
          <label htmlFor="rating-comment" className="block font-sans text-body-small text-ordift-ink">Anything we did particularly well or could improve? <span className="text-ordift-ink-muted">(optional)</span></label>
          <textarea id="rating-comment" name="comment" rows={3} maxLength={COMMENT_MAX} className="mt-2 w-full rounded-lg border border-black/15 bg-white p-3 font-sans text-body-small text-ordift-ink" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={BTN_PRIMARY}>{pending ? "Sending…" : "Send feedback"}</button>
          <button type="button" onClick={() => setSkipped(true)} className={BTN_OUTLINE}>Skip</button>
        </div>
        <Result state={result} />
      </form>
    </section>
  );
}
