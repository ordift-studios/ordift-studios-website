import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { listEligiblePeople, listTeamShowcaseEntries } from "@/lib/team/adminTeamData";
import { resolveTeamIdentityLabel } from "@/lib/team/identityFallback";
import {
  addToTeamAction,
  removeFromTeamAction,
  toggleVisibleAction,
  moveEntryAction,
  updateShowcaseFieldsAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Meet the Team — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Meet the Team curation manager — a control surface, not a second copy
// of anyone's profile data (see migration 0035's header comment).
// "Add to Team" only ever adds hidden (visible=false); an admin
// explicitly toggles each person visible once their public profile is
// ready. Removing someone here never touches their account, role, or
// project history — see removeFromTeamAction.
export default async function AdminTeamPage() {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) redirect("/admin/overview");

  const [entries, eligible] = await Promise.all([listTeamShowcaseEntries(), listEligiblePeople()]);
  const showcasedIds = new Set(entries.map((e) => e.id));
  const availableToAdd = eligible.filter((p) => !showcasedIds.has(p.id));

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          Meet the Team
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Choose which staff/collaborators appear on the public About page, in what order, and which optional details
          show for each. Being a Staff/Admin/Contractor account never makes someone public on its own — nothing shows
          until they&apos;re added here AND marked visible. Portrait and bio content is edited from each person&apos;s
          own Public Profile page, not here.
        </p>
      </div>

      <div className="space-y-4 mb-12">
        {entries.length === 0 && (
          <p className="font-sans text-body-small text-ordift-ink-muted">No one has been added to Meet the Team yet.</p>
        )}
        {entries.map((entry, idx) => (
          <div key={entry.id} className="bg-white rounded-lg border border-ordift-ink/10 p-5">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-full bg-black/5 overflow-hidden shrink-0">
                {entry.avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    style={{ objectPosition: `${entry.avatarFocalX}% ${entry.avatarFocalY}%` }}
                  />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-serif font-medium text-body text-ordift-ink">{resolveTeamIdentityLabel(entry)}</p>
                  <span
                    className={`font-sans text-caption uppercase tracking-[0.1em] px-2 py-0.5 rounded-full ${
                      entry.visible ? "bg-green-100 text-green-800" : "bg-black/5 text-ordift-ink-muted"
                    }`}
                  >
                    {entry.visible ? "Visible" : "Hidden"}
                  </span>
                  {entry.isCollaborator && (
                    <span className="font-sans text-caption uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-ordift-gold/15 text-ordift-gold-pressed">
                      Collaborator
                    </span>
                  )}
                </div>
                <p className="font-sans text-caption text-ordift-ink-muted mt-0.5">
                  Public name: {entry.masterDisplayName ?? "Not set yet"}
                  {!entry.hasPublicProfile && " — add a Public Profile before making visible"}
                </p>

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Link
                    href={`/admin/team/${entry.id}/profile`}
                    className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4"
                  >
                    Edit Public Profile
                  </Link>

                  <form action={toggleVisibleAction}>
                    <input type="hidden" name="profileId" value={entry.id} />
                    <input type="hidden" name="nextVisible" value={(!entry.visible).toString()} />
                    <button type="submit" className="font-sans text-caption text-ordift-ink underline underline-offset-4">
                      {entry.visible ? "Hide" : "Show"}
                    </button>
                  </form>

                  <form action={moveEntryAction}>
                    <input type="hidden" name="profileId" value={entry.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button
                      type="submit"
                      disabled={idx === 0}
                      className="font-sans text-caption text-ordift-ink underline underline-offset-4 disabled:opacity-30 disabled:no-underline"
                    >
                      Move Up
                    </button>
                  </form>

                  <form action={moveEntryAction}>
                    <input type="hidden" name="profileId" value={entry.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button
                      type="submit"
                      disabled={idx === entries.length - 1}
                      className="font-sans text-caption text-ordift-ink underline underline-offset-4 disabled:opacity-30 disabled:no-underline"
                    >
                      Move Down
                    </button>
                  </form>

                  <form action={removeFromTeamAction}>
                    <input type="hidden" name="profileId" value={entry.id} />
                    <button type="submit" className="font-sans text-caption text-red-700 underline underline-offset-4">
                      Remove from Team
                    </button>
                  </form>
                </div>

                <details className="mt-3">
                  <summary className="font-sans text-caption text-ordift-ink-muted cursor-pointer">
                    Which details show publicly
                  </summary>
                  <form action={updateShowcaseFieldsAction} className="mt-3 space-y-2">
                    <input type="hidden" name="profileId" value={entry.id} />
                    <label className="block">
                      <span className="font-sans text-caption text-ordift-ink-muted">
                        Display Name Override (optional — otherwise uses their Public Profile name)
                      </span>
                      <input
                        name="displayNameOverride"
                        defaultValue={entry.displayNameOverride ?? ""}
                        className="mt-1 w-full max-w-xs rounded-md border border-ordift-ink/20 px-3 py-1.5 font-sans text-caption"
                      />
                    </label>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {(
                        [
                          ["showBio", "Bio", entry.showBio],
                          ["showDepartment", "Department", entry.showDepartment],
                          ["showSpecialty", "Specialty", entry.showSpecialty],
                          ["showSocialHandle", "Social Handle", entry.showSocialHandle],
                          ["showQuote", "Favorite Quote", entry.showQuote],
                          ["showFunFact", "Fun Fact", entry.showFunFact],
                        ] as [string, string, boolean][]
                      ).map(([name, label, checked]) => (
                        <label key={name} className="inline-flex items-center gap-1.5">
                          <input type="checkbox" name={name} defaultChecked={checked} className="rounded border-ordift-ink/30" />
                          <span className="font-sans text-caption text-ordift-ink">{label}</span>
                        </label>
                      ))}
                      <label className="inline-flex items-center gap-1.5">
                        <input type="checkbox" name="isCollaborator" defaultChecked={entry.isCollaborator} className="rounded border-ordift-ink/30" />
                        <span className="font-sans text-caption text-ordift-ink">Mark as Collaborator (not staff)</span>
                      </label>
                    </div>
                    <button
                      type="submit"
                      className="rounded-full border border-ordift-ink/30 text-ordift-ink font-sans text-caption font-semibold px-4 py-1.5 hover:border-ordift-ink/60 transition-colors"
                    >
                      Save
                    </button>
                  </form>
                </details>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">Add to Team</h2>
        {availableToAdd.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">
            No eligible Staff/Contractor/Admin accounts left to add — everyone eligible is already on the list above.
          </p>
        ) : (
          <div className="bg-white rounded-lg border border-ordift-ink/10 divide-y divide-ordift-ink/10">
            {availableToAdd.map((person) => (
              <div key={person.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-sans text-body-small text-ordift-ink font-medium">{resolveTeamIdentityLabel(person)}</p>
                  <p className="font-sans text-caption text-ordift-ink-muted">
                    {[person.jobTitle, person.department].filter(Boolean).join(" · ") || person.roles.join(", ")}
                  </p>
                </div>
                <form action={addToTeamAction}>
                  <input type="hidden" name="profileId" value={person.id} />
                  <button
                    type="submit"
                    className="rounded-full bg-ordift-navy-950 text-white font-sans text-caption font-semibold px-4 py-1.5 hover:bg-ordift-navy-900 transition-colors shrink-0"
                  >
                    Add to Team
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
