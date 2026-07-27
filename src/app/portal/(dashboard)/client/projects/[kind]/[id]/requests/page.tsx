import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { getClientProjectRequests, isProjectKind } from "@/lib/portal/workspace";
import { getRequestTypes, PROJECT_REQUEST_STATUS_LABELS, type ProjectRequestStatus } from "@/lib/admin/projectRequests";
import { submitProjectRequestAction } from "./actions";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadgeClass(status: ProjectRequestStatus): string {
  switch (status) {
    case "approved":
      return "bg-ordift-gold/20 text-ordift-gold-pressed";
    case "rejected":
      return "bg-red-100 text-red-700";
    case "completed":
      return "bg-black/10 text-ordift-ink-muted";
    default:
      return "bg-ordift-offwhite text-ordift-ink";
  }
}

export default async function RequestsTabPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!isProjectKind(kind)) return null;
  const user = await getCurrentUser();
  if (!user) return null;

  const [requests, requestTypes] = await Promise.all([
    getClientProjectRequests(kind, id, user.id),
    getRequestTypes(),
  ]);

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">New Request</h2>
        {requestTypes.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">
            Requests aren&apos;t available right now — please{" "}
            <Link href="/book" className="text-ordift-gold-pressed underline underline-offset-4">
              contact us
            </Link>{" "}
            directly.
          </p>
        ) : (
          <form action={submitProjectRequestAction} className="space-y-3">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={id} />
            <div>
              <label className="font-sans text-caption text-ordift-ink-muted block mb-1">Request Type</label>
              <select
                name="requestTypeId"
                required
                className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
              >
                {requestTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-sans text-caption text-ordift-ink-muted block mb-1">
                Notes (optional)
              </label>
              <textarea
                name="clientNotes"
                rows={3}
                placeholder="Add any details that will help us action this…"
                className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink"
              />
            </div>
            <button
              type="submit"
              className="min-h-11 px-5 rounded-full bg-ordift-navy-950 text-white font-sans text-body-small"
            >
              Submit Request
            </button>
          </form>
        )}
      </div>

      <div>
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Your Requests</h2>
        {requests.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No requests submitted yet.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="rounded-xl border border-black/10 bg-white p-6">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-ordift-offwhite font-sans text-caption font-medium text-ordift-ink whitespace-nowrap">
                    {r.requestTypeLabel}
                  </span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-sans text-caption font-semibold whitespace-nowrap ${statusBadgeClass(r.status)}`}
                  >
                    {PROJECT_REQUEST_STATUS_LABELS[r.status]}
                  </span>
                </div>
                {r.clientNotes && (
                  <p className="font-sans text-body-small text-ordift-ink whitespace-pre-wrap">{r.clientNotes}</p>
                )}
                <p className="font-sans text-caption text-ordift-ink-muted mt-2">
                  Submitted {formatDateTime(r.createdAt)}
                </p>
                {r.staffResponse && (
                  <p className="font-sans text-body-small text-ordift-ink mt-3 pt-3 border-t border-black/5">
                    {r.staffResponse}
                  </p>
                )}
                {r.decidedAt && (
                  <p className="font-sans text-caption text-ordift-ink-muted mt-1">
                    Decided {formatDateTime(r.decidedAt)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
