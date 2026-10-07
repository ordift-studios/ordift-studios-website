"use client";

import { useActionState, useLayoutEffect, useRef } from "react";
import type { ActionState } from "@/lib/shared/actionState";

// Drop-in <form> for server actions typed (prev, formData) => ActionState.
// Success is shown only after the action returns ok; failures are shown
// as an alert. Pair the form's submit button with <SubmitButton> so the
// button disables and shows its pending label while the save is running
// (blocks duplicate submission). Messages are announced to assistive
// technology (role=status / role=alert).
//
// React 19 resets every uncontrolled field in a <form action> once the
// action settles — including when it FAILED, which wiped the user's
// input after any validation error (found in Crew Support QA,
// 2026-10-07). On a failed result the submitted values are put back so
// nobody re-types a long form; a successful result keeps React's reset.
// Hidden inputs and file/password fields are never restored.
const RESTORE_SKIP = new Set(["hidden", "file", "password", "submit", "button", "reset", "image"]);

export function restoreSubmittedValues(form: HTMLFormElement, snapshot: FormData) {
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
    if (!el.name || el.disabled) continue;
    if (el instanceof HTMLInputElement && RESTORE_SKIP.has(el.type)) continue;
    const submitted = snapshot.getAll(el.name).filter((v): v is string => typeof v === "string");
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      el.checked = submitted.includes(el.value);
    } else if (el instanceof HTMLSelectElement && el.multiple) {
      for (const opt of Array.from(el.options)) opt.selected = submitted.includes(opt.value);
    } else if (submitted.length > 0) {
      el.value = submitted[0];
    } else if (el instanceof HTMLSelectElement) {
      el.selectedIndex = -1;
      el.value = "";
    } else {
      el.value = "";
    }
  }
}

export default function ActionForm({
  action,
  className,
  encType,
  onSubmit,
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  className?: string;
  encType?: string;
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
  children: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef<FormData | null>(null);
  const capture = (prev: ActionState, formData: FormData) => {
    submitted.current = formData;
    return action(prev, formData);
  };
  const [state, formAction] = useActionState<ActionState, FormData>(capture, null);

  useLayoutEffect(() => {
    if (state?.ok === false && formRef.current && submitted.current) restoreSubmittedValues(formRef.current, submitted.current);
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className={className} encType={encType} onSubmit={onSubmit}>
      {children}
      {state?.ok === true && (
        <p role="status" className="col-span-full font-sans text-caption text-green-700">{state.message}</p>
      )}
      {state?.ok === false && (
        <p role="alert" className="col-span-full font-sans text-caption text-red-700">{state.error}</p>
      )}
    </form>
  );
}
