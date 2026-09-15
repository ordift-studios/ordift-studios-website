"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { recordSignatoryConsent, recordSignatorySignature, recordSignatoryDecline } from "@/lib/legal/signatureEngine";

// Public, session-less signatory actions (2026-09-15) — the token
// itself, verified server-side inside each of these existing
// signatureEngine.ts functions, is the only credential; no admin
// session is used or required anywhere on this path. The token travels
// as a hidden form field (same convention as agreementId in the
// Founder-facing LifecycleStepForm), not a bound closure argument, so
// these match this codebase's established useActionState signature.

async function requestContext() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ipAddress = forwarded?.split(",")[0]?.trim() || null;
  const userAgent = h.get("user-agent");
  return { ipAddress, userAgent };
}

export type SignatoryActionState = { ok: true } | { ok: false; error: string } | null;

export async function consentAction(_prev: SignatoryActionState, formData: FormData): Promise<SignatoryActionState> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { ok: false, error: "Invalid access link." };

  const result = await recordSignatoryConsent(token);
  if (!result.ok) return result;
  revalidatePath(`/legal/sign/${token}`);
  return { ok: true };
}

export async function signAction(_prev: SignatoryActionState, formData: FormData): Promise<SignatoryActionState> {
  const token = String(formData.get("token") ?? "").trim();
  const typedFullName = String(formData.get("typedFullName") ?? "").trim();
  const consentStatement = String(formData.get("consentStatement") ?? "").trim();
  if (!token) return { ok: false, error: "Invalid access link." };
  if (!typedFullName) return { ok: false, error: "Please type your full legal name to sign." };
  if (!consentStatement) return { ok: false, error: "Please confirm the consent statement to sign." };

  const { ipAddress, userAgent } = await requestContext();
  const result = await recordSignatorySignature({ rawToken: token, typedFullName, consentStatement, ipAddress, userAgent });
  if (!result.ok) return result;
  revalidatePath(`/legal/sign/${token}`);
  return { ok: true };
}

export async function declineAction(_prev: SignatoryActionState, formData: FormData): Promise<SignatoryActionState> {
  const token = String(formData.get("token") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!token) return { ok: false, error: "Invalid access link." };
  if (!reason) return { ok: false, error: "Please provide a reason." };

  const result = await recordSignatoryDecline({ rawToken: token, reason });
  if (!result.ok) return result;
  revalidatePath(`/legal/sign/${token}`);
  return { ok: true };
}
