import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { isProjectKind } from "@/lib/portal/workspace";
import { getWorkshopRegistrationByIdForUser } from "@/lib/portal/data";
import { listBriefsForWorkshop } from "@/lib/workshops/briefsAndSubmissions";

// Workshop Learning Infrastructure V1 (2026-09-19) — briefs themselves
// carry no sensitive data (they're the instructor's public instructions
// to the whole workshop), so this list only needs to confirm real
// registration ownership of the workshop, not per-brief authorization —
// the actual submission/feedback boundary is enforced on the detail
// page and its server actions.
export default async function BriefsTabPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!isProjectKind(kind) || kind !== "workshop") notFound();
  const user = await getCurrentUser();
  if (!user) return null;

  const registration = await getWorkshopRegistrationByIdForUser(id, user.id);
  if (!registration) return null;

  const briefs = await listBriefsForWorkshop(registration.workshopId);

  return (
    <div className="rounded-xl border border-black/10 bg-white p-6">
      {briefs.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">No creative briefs have been set for this workshop yet.</p>
      ) : (
        <ul className="divide-y divide-black/5">
          {briefs.map((b) => (
            <li key={b.id} className="py-3">
              <Link href={`/portal/client/projects/${kind}/${id}/briefs/${b.id}`} className="font-sans text-body-small font-medium text-ordift-gold-pressed underline underline-offset-4">
                {b.title}
              </Link>
              {b.dueAt && <p className="font-sans text-caption text-ordift-ink-muted mt-0.5">Due {new Date(b.dueAt).toLocaleString("en-GB")}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
