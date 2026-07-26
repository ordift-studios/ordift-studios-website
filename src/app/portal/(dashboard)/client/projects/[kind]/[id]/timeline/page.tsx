import { getCurrentUser } from "@/lib/portal/roles";
import { getWorkspaceTimeline, isProjectKind } from "@/lib/portal/workspace";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function TimelineTabPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!isProjectKind(kind)) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const entries = await getWorkspaceTimeline(kind, id, user.id);

  return (
    <div className="rounded-xl border border-black/10 bg-white p-6">
      {entries.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">No activity yet.</p>
      ) : (
        <ul className="space-y-4">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3">
              <span className="mt-1.5 h-2 w-2 rounded-full bg-ordift-gold shrink-0" />
              <div>
                <p className="font-sans text-body-small text-ordift-ink">{entry.label}</p>
                <p className="font-sans text-caption text-ordift-ink-muted mt-0.5">
                  {formatDateTime(entry.timestamp)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
