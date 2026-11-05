import { formatActorLabel, resolveActorIdentities } from "@/lib/portal/actorIdentity";
import { getStore } from "@/lib/connectPortfolio/defaultStore";
import { listHistory, loadState, type Deps } from "@/lib/connectPortfolio/service";
import { buildView, userIdsIn, type ManagerView } from "@/lib/connectPortfolio/view";
import type { ManagerState } from "@/lib/connectPortfolio/service";

// Server-only: reads the current state and history and resolves people to the audit label (member number first, per the Audit Identity Standard).
export const defaultDeps = (): Deps => ({ store: getStore() });

export async function viewFor(state: ManagerState, deps: Deps = defaultDeps()): Promise<ManagerView> {
  const revisions = await listHistory(deps, 20);
  const identities = await resolveActorIdentities(userIdsIn(state, revisions));
  return buildView(state, revisions, (id) => (id ? formatActorLabel(identities.get(id)) : "Unknown"));
}

export async function loadView(deps: Deps = defaultDeps()): Promise<ManagerView> {
  return viewFor(await loadState(deps), deps);
}
