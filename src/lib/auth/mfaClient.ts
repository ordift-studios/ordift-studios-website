import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliseCode, type AssuranceInfo } from "./stepUp";

// Browser-side helpers for authenticator-app (TOTP) enrolment and step-up. They take the signed-in visitor's OWN client, so every call is made as that person and checked by the authentication service.
// SECRETS: the setup key and QR code exist only in the return value of beginEnrolment, for the person enrolling, so they can scan it. Nothing here logs, stores, caches or sends them anywhere else, and no server
// action or server module is involved: the server never sees a secret, a code or a recovery credential. Callers must keep it that way (a test checks the components).
export type Factor = { id: string; name: string; createdAt: string };
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

export async function getAssurance(client: SupabaseClient): Promise<AssuranceInfo | null> {
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return null;
  return { currentLevel: data.currentLevel, nextLevel: data.nextLevel, methods: (data.currentAuthenticationMethods ?? []).map((m) => (typeof m === "string" ? { method: m, timestamp: NaN } : { method: String(m.method), timestamp: Number(m.timestamp) })) };   // a bare method name carries no time, so it never counts as fresh
}

export async function listFactors(client: SupabaseClient): Promise<Result<{ verified: Factor[]; unfinished: Factor[] }>> {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error || !data) return fail("Your authenticator apps could not be listed. Try again.");
  const all = (data.all ?? []).filter((f) => f.factor_type === "totp");
  const map = (f: { id: string; friendly_name?: string; created_at: string }): Factor => ({ id: f.id, name: f.friendly_name ?? "Authenticator app", createdAt: f.created_at });
  return { ok: true, verified: all.filter((f) => f.status === "verified").map(map), unfinished: all.filter((f) => f.status !== "verified").map(map) };
}

export async function beginEnrolment(client: SupabaseClient, name: string): Promise<Result<{ factorId: string; qrCode: string; setupKey: string }>> {
  const friendlyName = name.trim().slice(0, 40) || "Authenticator app";
  const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName });
  if (error || !data?.totp) return fail(/maximum|too many/i.test(error?.message ?? "") ? "You already have the maximum number of authenticator apps. Remove one first." : "Authenticator setup could not be started. Try again.");
  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, setupKey: data.totp.secret };
}

export async function confirmEnrolment(client: SupabaseClient, factorId: string, rawCode: string): Promise<Result> {
  const code = normaliseCode(rawCode); if (!code) return fail("Enter the 6-digit code from your authenticator app.");
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
  return error ? fail("That code did not match. Check the time on your phone and try the next code.") : { ok: true };
}

export async function cancelEnrolment(client: SupabaseClient, factorId: string): Promise<Result> {
  const { error } = await client.auth.mfa.unenroll({ factorId });
  return error ? fail("The unfinished setup could not be cancelled.") : { ok: true };
}

// Step-up: prove the second factor now. Uses the first verified authenticator app. The new session token carries a fresh second-factor time; the next server request uses it.
export async function stepUp(client: SupabaseClient, rawCode: string): Promise<Result> {
  const code = normaliseCode(rawCode); if (!code) return fail("Enter the 6-digit code from your authenticator app.");
  const f = await listFactors(client); if (!f.ok) return f;
  if (f.verified.length === 0) return fail("No authenticator app is set up for your account yet.");
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId: f.verified[0].id, code });
  return error ? fail("That code did not match. Check the time on your phone and try the next code.") : { ok: true };
}

// Removing a verified app needs a recent second factor (the authentication service enforces it); the caller should step up first.
export async function removeFactor(client: SupabaseClient, factorId: string): Promise<Result> {
  const { error } = await client.auth.mfa.unenroll({ factorId });
  if (error) return fail("That authenticator app could not be removed. Confirm a code from another app first, then retry.");
  await client.auth.refreshSession();     // the service lowers a session that relied on the removed app; take the new, lower token so the screens and the next request agree
  return { ok: true };
}
