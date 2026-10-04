// Platform-wide "no silent consequential actions" standard (2026-10-04).
// One result shape for every server action that mutates data and is
// driven by a form: the UI reports success only after the action itself
// returns ok, and shows `error` verbatim on failure. Pair with
// <ActionForm> + <SubmitButton> (src/components/admin/). Pure and
// import-free so it is safe in both server and client code.
export type ActionState = { ok: true; message: string } | { ok: false; error: string } | null;

export function actionOk(message: string): ActionState {
  return { ok: true, message };
}

export function actionFail(error: string): ActionState {
  return { ok: false, error };
}

// Wraps a mutation so a thrown error becomes a visible failure instead of
// an unhandled rejection or a silent no-op. Never swallows into success.
export async function runAction(fn: () => Promise<ActionState>, logLabel: string): Promise<ActionState> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[action] ${logLabel} failed`, error);
    return actionFail("Something went wrong and your change was not saved. Please try again.");
  }
}
