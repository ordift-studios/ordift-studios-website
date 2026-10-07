// Pure orchestration for one client notification, with injected I/O so the
// guarantees are directly testable: (1) claim-before-send idempotency,
// (2) TEST/QA records are recorded but NEVER delivered, (3) a send failure
// or exception is recorded and never thrown to the caller (so it can't
// corrupt the status change that triggered it).

export type EmailOutcome = { ok: true; mode: "sent" | "logged"; attempts: number } | { ok: false; error: string; attempts: number } | undefined;

export type FlowDeps = {
  claim: () => Promise<"claimed" | "duplicate" | "error">;
  record: (status: "sent" | "logged" | "failed" | "suppressed_test", extra: { attempts?: number; error?: string | null }) => Promise<void>;
  send: () => Promise<EmailOutcome>;
  logTestSuppressed: () => void;
};

export type FlowOutcome = "sent" | "logged" | "failed" | "suppressed_test" | "already_recorded" | "skipped";

export async function runNotification(isTest: boolean, deps: FlowDeps): Promise<FlowOutcome> {
  const claim = await deps.claim();
  if (claim === "duplicate") return "already_recorded";
  if (claim === "error") return "skipped";

  if (isTest) {
    deps.logTestSuppressed();
    await deps.record("suppressed_test", {});
    return "suppressed_test";
  }

  try {
    const sent = await deps.send();
    const status = !sent ? "failed" : sent.ok ? sent.mode : "failed";
    await deps.record(status, { attempts: sent?.attempts ?? 0, error: sent && !sent.ok ? sent.error : null });
    return status;
  } catch (error) {
    console.error("[crew-support] notification send threw", error);
    await deps.record("failed", { attempts: 1, error: "unexpected error" }).catch(() => undefined);
    return "failed";
  }
}
