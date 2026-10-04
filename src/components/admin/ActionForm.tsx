"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/shared/actionState";

// Drop-in <form> for server actions typed (prev, formData) => ActionState.
// Success is shown only after the action returns ok; failures are shown
// as an alert. Pair the form's submit button with <SubmitButton> so the
// button disables and shows its pending label while the save is running
// (blocks duplicate submission). Messages are announced to assistive
// technology (role=status / role=alert).
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
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  return (
    <form action={formAction} className={className} encType={encType} onSubmit={onSubmit}>
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
