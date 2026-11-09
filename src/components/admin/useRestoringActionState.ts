"use client";

import { useActionState, useLayoutEffect, useRef } from "react";
import { restoreSubmittedValues } from "./ActionForm";

// A drop-in for useActionState for forms that render their own <form action={...}> (and so cannot use <ActionForm>).
//
// React 19 resets every uncontrolled field in a <form action> once the action settles, including when the action REFUSED the input, which wipes what the person typed. This hook keeps
// the submitted values and puts them back when the result is a refusal (the same helper <ActionForm> uses). A success keeps React's reset. Hidden, file and password fields are never
// restored. Use:   const [state, formAction, pending, formRef] = useRestoringActionState(action, null);   <form ref={formRef} action={formAction}>
//
// A result counts as a refusal when it says ok === false, or (for older state shapes without `ok`) carries an `error` string. Pass your own test for anything else.
export function isRefusal(state: unknown): boolean {
  if (!state || typeof state !== "object") return false;
  const s = state as { ok?: unknown; error?: unknown };
  return s.ok === false || (!("ok" in s) && typeof s.error === "string" && s.error.length > 0);
}

export function useRestoringActionState<S>(action: (prev: Awaited<S>, formData: FormData) => S | Promise<S>, initial: Awaited<S>, refused: (s: Awaited<S>) => boolean = isRefusal) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef<FormData | null>(null);
  const [state, formAction, pending] = useActionState<S, FormData>((prev, fd) => { submitted.current = fd; return action(prev, fd); }, initial);
  useLayoutEffect(() => {
    if (refused(state) && formRef.current && submitted.current) restoreSubmittedValues(formRef.current, submitted.current);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  return [state, formAction, pending, formRef] as const;
}
