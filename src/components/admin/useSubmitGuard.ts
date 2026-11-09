"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { createInFlightLock } from "@/lib/payments/checkoutFormRules";

// One submission at a time for a <form action>. The pending flag only turns true on the next render, so two submits in the same instant would both get through; this takes a lock synchronously in onSubmit
// and releases it when the action settles. Use:  const guard = useSubmitGuard(pending);  <form onSubmit={guard} ...>
export function useSubmitGuard(pending: boolean) {
  const lock = useRef(createInFlightLock());
  useEffect(() => { if (!pending) lock.current.release(); }, [pending]);
  return (e: FormEvent) => { if (pending || !lock.current.tryAcquire()) e.preventDefault(); };
}
