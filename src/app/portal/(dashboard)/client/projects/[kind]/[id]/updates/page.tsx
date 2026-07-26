import { getCurrentUser } from "@/lib/portal/roles";
import { getClientUpdates, isProjectKind } from "@/lib/portal/workspace";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function UpdatesTabPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!isProjectKind(kind)) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const updates = await getClientUpdates(kind, id, user.id);

  return (
    <div className="rounded-xl border border-black/10 bg-white p-6">
      {updates.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">
          No updates yet — official project updates from the team will appear here.
        </p>
      ) : (
        <div className="space-y-5">
          {updates.map((update) => (
            <div key={update.id} className="border-b border-black/5 pb-5 last:border-0 last:pb-0">
              <p className="font-sans text-body-small text-ordift-ink whitespace-pre-wrap">{update.note}</p>
              <p className="font-sans text-caption text-ordift-ink-muted mt-2">
                {formatDateTime(update.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
