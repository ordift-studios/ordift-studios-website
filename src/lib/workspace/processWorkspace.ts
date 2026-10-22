// Reusable model for ONE guided workspace per business process (onboarding, booking, engagement, ...). A workspace is an ordered list of
// numbered steps. Each step names its owner, what the system already knows, what is missing, its state, and the single action that moves
// it forward. Systems of record (HR, Legal, Finance, Operations) stay authoritative: a step only DERIVES its state from their records and
// points at - or embeds - their existing authorised action. Progress is never stored in the workspace itself, so returning to the same
// URL always shows the true position.

export type StepState = "completed" | "pending" | "blocked" | "not_applicable";

export type StepAction =
  | { kind: "anchor"; href: string; label: string } // an existing form further down the same page
  | { kind: "link"; href: string; label: string } // an existing record page (opens in the same session)
  | { kind: "embedded"; label: string }; // the step's own embedded forms are shown with it

export type WorkspaceStep<TCheck = never> = {
  number: number;
  key: string;
  title: string;
  owner: string;
  purpose: string;
  known: string[];
  missing: string[];
  state: StepState;
  blocker: string | null;
  action: StepAction | null;
  checks: TCheck[];
};

export type WorkspaceSummary = { applicable: number; completed: number; percent: number; currentIndex: number | null };

export function summarizeWorkspace(steps: readonly { state: StepState }[]): WorkspaceSummary {
  const applicable = steps.filter((s) => s.state !== "not_applicable");
  const completed = applicable.filter((s) => s.state === "completed").length;
  const idx = steps.findIndex((s) => s.state === "pending" || s.state === "blocked");
  return { applicable: applicable.length, completed, percent: applicable.length ? Math.round((completed / applicable.length) * 100) : 100, currentIndex: idx < 0 ? null : idx };
}
