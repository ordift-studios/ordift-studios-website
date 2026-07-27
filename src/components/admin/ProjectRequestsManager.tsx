import type {
  AdminProjectRequest,
  ProjectRequestEntityType,
  ProjectRequestStatus,
} from "@/lib/admin/projectRequests";
import { PROJECT_REQUEST_STATUSES, PROJECT_REQUEST_STATUS_LABELS } from "@/lib/admin/projectRequests";
import { decideProjectRequestAction } from "@/app/admin/project-requests/actions";

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

export default function ProjectRequestsManager({
  entityType,
  entityId,
  requests,
}: {
  entityType: ProjectRequestEntityType;
  entityId: string;
  requests: AdminProjectRequest[];
}) {
  return (
    <div>
      <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Requests</h2>

      {requests.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">No requests submitted yet.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-black/10 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-ordift-offwhite font-sans text-caption font-medium text-ordift-ink whitespace-nowrap">
                  {r.requestTypeLabel}
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-sans text-caption font-semibold whitespace-nowrap ${statusBadgeClass(r.status)}`}
                >
                  {PROJECT_REQUEST_STATUS_LABELS[r.status]}
                </span>
              </div>

              {r.clientNotes && <p className="font-sans text-body-small text-ordift-ink">{r.clientNotes}</p>}
              <p className="font-sans text-caption text-ordift-ink-muted">Submitted {formatDateTime(r.createdAt)}</p>
              {r.staffResponse && (
                <p className="font-sans text-caption text-ordift-ink-muted">Response: {r.staffResponse}</p>
              )}
              {r.decidedAt && (
                <p className="font-sans text-caption text-ordift-ink-muted">Decided {formatDateTime(r.decidedAt)}</p>
              )}

              <form
                action={decideProjectRequestAction}
                className="flex flex-wrap items-end gap-3 pt-3 border-t border-black/5"
              >
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="entityType" value={entityType} />
                <input type="hidden" name="entityId" value={entityId} />
                <div>
                  <label htmlFor={`request-status-${r.id}`} className="font-sans text-caption text-ordift-ink-muted block mb-1">
                    Status
                  </label>
                  <select
                    id={`request-status-${r.id}`}
                    name="status"
                    defaultValue={r.status}
                    className="min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
                  >
                    {PROJECT_REQUEST_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {PROJECT_REQUEST_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label htmlFor={`request-staff-response-${r.id}`} className="font-sans text-caption text-ordift-ink-muted block mb-1">
                    Staff Response (optional)
                  </label>
                  <input
                    id={`request-staff-response-${r.id}`}
                    type="text"
                    name="staffResponse"
                    defaultValue={r.staffResponse ?? ""}
                    className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
                  />
                </div>
                <button
                  type="submit"
                  className="min-h-11 px-5 rounded-full bg-ordift-navy-950 text-white font-sans text-body-small"
                >
                  Update
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
