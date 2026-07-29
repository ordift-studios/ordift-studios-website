import { Resend } from "resend";
import { productionSendingEnabled } from "@/lib/shared/env";

// Single shared send path for every email-producing form (Contact
// Enquiry, Workshop Registration, Project Requests) — previously each
// module had its own copy-pasted dispatch()/Resend client. Centralizing
// it here means retry/backoff behavior, transient-vs-permanent
// classification, and logging format are defined once and can't drift
// between forms.

export type EmailResult =
  | { ok: true; mode: "sent" | "logged"; attempts: number }
  | { ok: false; error: string; attempts: number; permanent: boolean };

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resend's ErrorResponse carries a real HTTP statusCode, which is a far
// more reliable signal than pattern-matching `name` strings (Resend
// adds new error names over time; status code semantics don't change).
// 4xx (validation, auth, not-found, payload) means retrying the exact
// same request will fail the exact same way — never retry those.
// 429 (rate limited) and 5xx/null (network-level, Resend-side outage)
// are the only cases retrying can plausibly help.
function isTransientStatus(statusCode: number | null): boolean {
  if (statusCode === null) return true; // network/fetch-level failure, no HTTP response at all
  if (statusCode === 429) return true;
  return statusCode >= 500;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  logPrefix: string;
}): Promise<EmailResult> {
  const { to, subject, html, text, logPrefix } = params;

  if (!productionSendingEnabled()) {
    console.log(`${logPrefix} [test-mode] would send email to ${to}\nSubject: ${subject}\n${text}\n`);
    return { ok: true, mode: "logged", attempts: 0 };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS;
  if (!apiKey || !from) {
    console.error(`${logPrefix} production sending enabled but email credentials are missing`);
    return { ok: false, error: "email-not-configured", attempts: 0, permanent: true };
  }

  const resend = new Resend(apiKey);
  let lastError = "unknown-error";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await resend.emails.send({ from, to, subject, html, text });

      if (!result.error) {
        if (attempt > 1) {
          console.log(`${logPrefix} email sent on retry (attempt ${attempt}/${MAX_ATTEMPTS}) to ${to}`);
        }
        return { ok: true, mode: "sent", attempts: attempt };
      }

      lastError = result.error.message;
      const transient = isTransientStatus(result.error.statusCode);
      console.error(
        `${logPrefix} email send failed (attempt ${attempt}/${MAX_ATTEMPTS}, ${transient ? "transient" : "permanent"}, status ${result.error.statusCode})`,
        result.error.name,
        result.error.message
      );

      if (!transient) {
        // Permanent failure (bad address, auth, payload) — retrying the
        // identical request will only ever produce the identical
        // failure. Fail fast instead of burning attempts/latency.
        return { ok: false, error: lastError, attempts: attempt, permanent: true };
      }
    } catch (err) {
      // A thrown error here means the request never got an HTTP
      // response at all (DNS, TCP, timeout) — always transient by
      // definition, since there's no server-side rejection to respect.
      lastError = err instanceof Error ? err.message : "unknown-error";
      console.error(`${logPrefix} email send threw (attempt ${attempt}/${MAX_ATTEMPTS}, transient — network error)`, lastError);
    }

    if (attempt < MAX_ATTEMPTS) {
      const delayMs = BASE_DELAY_MS * 2 ** (attempt - 1);
      await sleep(delayMs);
    }
  }

  console.error(`${logPrefix} email send exhausted all ${MAX_ATTEMPTS} attempts to ${to}`, lastError);
  return { ok: false, error: lastError, attempts: MAX_ATTEMPTS, permanent: false };
}
