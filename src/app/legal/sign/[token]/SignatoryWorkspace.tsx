"use client";

import { useActionState, useState } from "react";
import { consentAction, signAction, declineAction, type SignatoryActionState } from "./actions";

const CONSENT_STATEMENT =
  "I have reviewed the document above and I am signing it electronically, intending this to have the same legal effect as a handwritten signature.";

function ConsentStep({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<SignatoryActionState, FormData>(consentAction, null);
  const succeeded = !pending && state?.ok === true;

  if (succeeded) {
    return (
      <p role="status" aria-live="polite" className="font-sans text-body-small text-green-700">
        Consent recorded. You can now sign below.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Before you can sign, please confirm you have reviewed the document above and consent to sign it
          electronically.
        </p>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="self-start font-sans text-caption font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50"
        >
          {pending ? "Recording…" : "I have reviewed this document and consent to sign electronically"}
        </button>
      </form>
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
    </div>
  );
}

function SignStep({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<SignatoryActionState, FormData>(signAction, null);
  const succeeded = !pending && state?.ok === true;

  if (succeeded) {
    return (
      <p role="status" aria-live="polite" className="font-sans text-body-small text-green-700">
        Signed. Thank you — your signature has been recorded.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <form action={formAction} className="flex flex-col gap-3 max-w-md">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="consentStatement" value={CONSENT_STATEMENT} />
        <label className="font-sans text-caption font-medium text-ordift-ink">
          Type your full legal name to sign
          <input
            type="text"
            name="typedFullName"
            required
            className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-sans text-body-small"
            placeholder="Full legal name"
          />
        </label>
        <p className="font-sans text-caption text-ordift-ink-muted">{CONSENT_STATEMENT}</p>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="self-start font-sans text-caption font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50"
        >
          {pending ? "Signing…" : "Sign this agreement"}
        </button>
      </form>
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
    </div>
  );
}

function DeclineStep({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<SignatoryActionState, FormData>(declineAction, null);
  const [expanded, setExpanded] = useState(false);
  const succeeded = !pending && state?.ok === true;

  if (succeeded) {
    return (
      <p role="status" aria-live="polite" className="font-sans text-body-small text-ordift-ink-muted">
        You have declined to sign this agreement.
      </p>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="font-sans text-caption font-medium text-ordift-ink-muted underline"
      >
        I do not wish to sign
      </button>
    );
  }

  return (
    <div className="space-y-2 max-w-md">
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="token" value={token} />
        <label className="font-sans text-caption font-medium text-ordift-ink">
          Reason (shared with Ordift Studios)
          <textarea name="reason" required rows={3} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-sans text-body-small" />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md border border-red-300 text-red-700 disabled:opacity-50"
          >
            {pending ? "Submitting…" : "Confirm decline"}
          </button>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="font-sans text-caption font-medium px-3 py-1.5 rounded-md border border-black/15"
          >
            Cancel
          </button>
        </div>
      </form>
      {!pending && state?.ok === false && <p className="font-sans text-caption text-red-700">{state.error}</p>}
    </div>
  );
}

// Drives the signatory's visible next step off their real persisted
// status — never lets a client re-request an action their status no
// longer permits (each action's own server-side function independently
// re-verifies the token and status regardless, this is just UX).
export function SignatoryWorkspace({ token, status }: { token: string; status: string }) {
  if (status === "signed") {
    return (
      <p role="status" className="font-sans text-body-small text-green-700 bg-green-50 border border-green-200 rounded px-4 py-3">
        You have signed this agreement. Thank you.
      </p>
    );
  }
  if (status === "declined") {
    return (
      <p className="font-sans text-body-small text-ordift-ink-muted bg-black/5 border border-black/10 rounded px-4 py-3">
        You declined to sign this agreement.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {status === "consented" ? <SignStep token={token} /> : <ConsentStep token={token} />}
      <DeclineStep token={token} />
    </div>
  );
}
