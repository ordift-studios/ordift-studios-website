import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { isProjectKind } from "@/lib/portal/workspace";
import { getWorkshopRegistrationByIdForUser } from "@/lib/portal/data";
import { listMaterialsForParticipant } from "@/lib/workshops/materials";

// Workshop Learning Infrastructure V1 (2026-09-19) — participant-tier
// materials only, timing-gated, for a workshop the caller is
// genuinely registered on. Every download goes through
// getMaterialDownloadUrl() (server action), never a direct storage
// link — see materials/[materialId]/download route below.
export default async function MaterialsTabPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (!isProjectKind(kind) || kind !== "workshop") notFound();
  const user = await getCurrentUser();
  if (!user) return null;

  const registration = await getWorkshopRegistrationByIdForUser(id, user.id);
  if (!registration) return null;

  const materials = await listMaterialsForParticipant(registration.workshopId, user.id);

  return (
    <div className="rounded-xl border border-black/10 bg-white p-6">
      {materials.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">No materials shared for this workshop yet.</p>
      ) : (
        <ul className="divide-y divide-black/5">
          {materials.map((m) => (
            <li key={m.id} className="py-3 flex items-start justify-between gap-3">
              <div>
                <p className="font-sans text-body-small font-medium text-ordift-ink">{m.title}</p>
                {m.description && <p className="font-sans text-caption text-ordift-ink-muted mt-0.5">{m.description}</p>}
              </div>
              {m.externalUrl ? (
                <a href={m.externalUrl} target="_blank" rel="noopener noreferrer" className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4 whitespace-nowrap">
                  Open →
                </a>
              ) : (
                <a href={`/api/workshop-materials/${m.id}/download`} className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4 whitespace-nowrap">
                  Download →
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
