"use client";

import { useMemo, useState, useTransition } from "react";
import type { AdminUserRow, LookupOption } from "@/lib/portal/adminData";
import type { RoleSlug } from "@/lib/portal/roles";
import type { AdminProjectAssignment, AssignmentStatus, ProjectSearchResult } from "@/lib/admin/projectAssignments";
import type { ActivityLogEntry } from "@/lib/admin/activityLog";
import {
  grantRoleAction,
  revokeRoleAction,
  updateAccessStatusAction,
  setAccessExpiryAction,
  updateCollaboratorDetailsAction,
  assignToProjectAction,
  updateAssignmentStatusAction,
  inviteCollaboratorAction,
  searchProjectsAction,
  getAssignmentsForUserAction,
  getAccessHistoryForUserAction,
} from "./actions";

const ROLE_LABELS: Record<RoleSlug, string> = {
  client: "Client",
  workshop_participant: "Workshop Participant",
  model: "Model",
  vendor: "Vendor",
  staff: "Staff",
  contractor: "Contractor",
  admin: "Admin",
  super_admin: "Super Admin",
};

const ALL_GRANTABLE_ROLES: RoleSlug[] = ["staff", "contractor", "model", "vendor", "admin", "super_admin"];

const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  invited: "Invited",
  active: "Active",
  completed: "Completed",
  removed: "Removed",
  withdrawn: "Withdrawn",
};

function StatusBadge({ status }: { status: AdminUserRow["accessStatus"] }) {
  const styles: Record<AdminUserRow["accessStatus"], string> = {
    active: "bg-green-100 text-green-800",
    suspended: "bg-amber-100 text-amber-800",
    deactivated: "bg-red-100 text-red-800",
  };
  const labels: Record<AdminUserRow["accessStatus"], string> = {
    active: "Active",
    suspended: "Suspended",
    deactivated: "Deactivated",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full font-sans text-caption font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function ConfirmBar({
  message,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 flex items-center justify-between gap-3">
      <p className="font-sans text-caption text-amber-900">{message}</p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className="font-sans text-caption font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white hover:bg-ordift-navy-900 disabled:opacity-50"
        >
          {pending ? "Working…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}

function UserDetail({
  user,
  currentUserIsSuperAdmin,
  operationalTitles,
  engagementTypes,
}: {
  user: AdminUserRow;
  currentUserIsSuperAdmin: boolean;
  operationalTitles: LookupOption[];
  engagementTypes: LookupOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<null | { kind: "suspend" | "deactivate" | "reactivate" | "restore" }>(
    null
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expiry, setExpiry] = useState(user.accessExpiresAt ? user.accessExpiresAt.slice(0, 10) : "");
  const [titleId, setTitleId] = useState(user.operationalTitleId ?? "");
  const [engagementId, setEngagementId] = useState(user.engagementTypeId ?? "");

  const [assignments, setAssignments] = useState<AdminProjectAssignment[] | null>(null);
  const [history, setHistory] = useState<ActivityLogEntry[] | null>(null);
  const [projectQuery, setProjectQuery] = useState("");
  const [projectResults, setProjectResults] = useState<ProjectSearchResult[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectSearchResult | null>(null);
  const [assignExpiry, setAssignExpiry] = useState("");
  const [assignNote, setAssignNote] = useState("");

  function loadAssignments() {
    startTransition(async () => {
      setAssignments(await getAssignmentsForUserAction(user.id));
    });
  }
  function loadHistory() {
    startTransition(async () => {
      setHistory(await getAccessHistoryForUserAction(user.id));
    });
  }

  function runStatusChange(status: "active" | "suspended" | "deactivated") {
    setError(null);
    const fd = new FormData();
    fd.set("userId", user.id);
    fd.set("status", status);
    fd.set("reason", reason);
    startTransition(async () => {
      const result = await updateAccessStatusAction(fd);
      if (result.error) setError(result.error);
      else {
        setConfirming(null);
        setReason("");
      }
    });
  }

  function saveExpiry() {
    setError(null);
    const fd = new FormData();
    fd.set("userId", user.id);
    fd.set("expiresAt", expiry);
    startTransition(async () => {
      const result = await setAccessExpiryAction(fd);
      if (result.error) setError(result.error);
    });
  }

  function saveCollaboratorDetails() {
    setError(null);
    const fd = new FormData();
    fd.set("userId", user.id);
    fd.set("operationalTitleId", titleId);
    fd.set("engagementTypeId", engagementId);
    startTransition(async () => {
      const result = await updateCollaboratorDetailsAction(fd);
      if (result.error) setError(result.error);
    });
  }

  function runProjectSearch(q: string) {
    setProjectQuery(q);
    setSelectedProject(null);
    startTransition(async () => {
      setProjectResults(q.trim().length >= 2 ? await searchProjectsAction(q) : []);
    });
  }

  function confirmAssign() {
    if (!selectedProject) return;
    setError(null);
    const fd = new FormData();
    fd.set("userId", user.id);
    fd.set("entityType", selectedProject.entityType);
    fd.set("entityId", selectedProject.entityId);
    fd.set("roleNote", assignNote);
    fd.set("accessExpiresAt", assignExpiry);
    startTransition(async () => {
      const result = await assignToProjectAction(fd);
      if (result.error) setError(result.error);
      else {
        setSelectedProject(null);
        setProjectQuery("");
        setProjectResults([]);
        setAssignNote("");
        setAssignExpiry("");
        loadAssignments();
      }
    });
  }

  function changeAssignmentStatus(assignmentId: string, status: AssignmentStatus, removalReason?: string) {
    setError(null);
    const fd = new FormData();
    fd.set("assignmentId", assignmentId);
    fd.set("status", status);
    fd.set("reason", removalReason ?? "");
    startTransition(async () => {
      const result = await updateAssignmentStatusAction(fd);
      if (result.error) setError(result.error);
      else loadAssignments();
    });
  }

  return (
    <div className="border-t border-black/10 bg-ordift-offwhite/60 px-5 py-5 space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p className="font-sans text-caption text-red-700">{error}</p>
        </div>
      )}

      {/* Access status */}
      <section className="space-y-2">
        <h3 className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted">
          Access Status
        </h3>
        {!confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={user.accessStatus} />
            {user.accessStatusReason && (
              <span className="font-sans text-caption text-ordift-ink-muted">— {user.accessStatusReason}</span>
            )}
            <div className="flex gap-2 ml-auto">
              {user.accessStatus === "active" && (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirming({ kind: "suspend" })}
                    className="font-sans text-caption px-3 py-1.5 rounded-md border border-black/15 hover:bg-black/5"
                  >
                    Suspend
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming({ kind: "deactivate" })}
                    className="font-sans text-caption px-3 py-1.5 rounded-md border border-red-300 text-red-700 hover:bg-red-50"
                  >
                    Deactivate
                  </button>
                </>
              )}
              {user.accessStatus === "suspended" && (
                <button
                  type="button"
                  onClick={() => setConfirming({ kind: "reactivate" })}
                  className="font-sans text-caption px-3 py-1.5 rounded-md border border-black/15 hover:bg-black/5"
                >
                  Reactivate
                </button>
              )}
              {user.accessStatus === "deactivated" && (
                <button
                  type="button"
                  onClick={() => setConfirming({ kind: "restore" })}
                  className="font-sans text-caption px-3 py-1.5 rounded-md border border-black/15 hover:bg-black/5"
                >
                  Restore
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional, recorded in the history log)"
              className="w-full rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
              rows={2}
            />
            <ConfirmBar
              message={
                confirming.kind === "suspend"
                  ? `Suspend all internal access for ${user.email}? They will be unable to sign in until reactivated.`
                  : confirming.kind === "deactivate"
                    ? `Deactivate ${user.email} while preserving their records? This is the recommended offboarding step — not account deletion.`
                    : confirming.kind === "reactivate"
                      ? `Restore access for ${user.email}?`
                      : `Restore this deactivated account for ${user.email}?`
              }
              confirmLabel={
                confirming.kind === "suspend"
                  ? "Suspend access"
                  : confirming.kind === "deactivate"
                    ? "Deactivate"
                    : "Restore access"
              }
              pending={pending}
              onCancel={() => {
                setConfirming(null);
                setReason("");
              }}
              onConfirm={() =>
                runStatusChange(
                  confirming.kind === "suspend"
                    ? "suspended"
                    : confirming.kind === "deactivate"
                      ? "deactivated"
                      : "active"
                )
              }
            />
          </div>
        )}
      </section>

      {/* Roles */}
      <section className="space-y-2">
        <h3 className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted">
          System Role
        </h3>
        <div className="flex flex-wrap gap-2">
          {user.roles.length === 0 && <span className="font-sans text-caption text-ordift-ink-muted">No roles</span>}
          {user.roles.map((role) => {
            const superAdminGated = role === "admin" || role === "super_admin";
            const disallowed = superAdminGated && !currentUserIsSuperAdmin;
            return (
              <span
                key={role}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-black/10 font-sans text-caption text-ordift-ink"
              >
                {ROLE_LABELS[role]}
                {!disallowed && (
                  <form action={revokeRoleAction}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="role" value={role} />
                    <button
                      type="submit"
                      aria-label={`Revoke ${ROLE_LABELS[role]}`}
                      className="text-ordift-ink-muted hover:text-red-600 leading-none"
                    >
                      ×
                    </button>
                  </form>
                )}
              </span>
            );
          })}
        </div>
        <form action={grantRoleAction} className="flex items-center gap-2 pt-1">
          <input type="hidden" name="userId" value={user.id} />
          <select name="role" defaultValue="" required className="min-h-9 rounded-lg border border-black/15 bg-white px-2 font-sans text-body-small">
            <option value="" disabled>
              Grant role…
            </option>
            {ALL_GRANTABLE_ROLES.filter((r) => !user.roles.includes(r))
              .filter((r) => currentUserIsSuperAdmin || (r !== "admin" && r !== "super_admin"))
              .map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
          </select>
          <button type="submit" className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">
            Grant
          </button>
        </form>
        {!currentUserIsSuperAdmin && (
          <p className="font-sans text-caption text-ordift-ink-muted">
            Only a Super Admin can grant, revoke, suspend, or deactivate Admin/Super Admin accounts.
          </p>
        )}
      </section>

      {/* Expiry */}
      <section className="space-y-2">
        <h3 className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted">
          Access Expiry (optional)
        </h3>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small"
          />
          <button
            type="button"
            onClick={saveExpiry}
            disabled={pending}
            className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4 disabled:opacity-50"
          >
            Save
          </button>
          {expiry && (
            <button
              type="button"
              onClick={() => {
                setExpiry("");
                saveExpiry();
              }}
              disabled={pending}
              className="font-sans text-caption text-ordift-ink-muted underline underline-offset-4"
            >
              Clear
            </button>
          )}
        </div>
        <p className="font-sans text-caption text-ordift-ink-muted">
          For temporary or project-based collaborators. Past this date, access is blocked automatically — no manual
          follow-up needed.
        </p>
      </section>

      {/* Operational title / engagement type */}
      <section className="space-y-2">
        <h3 className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted">
          Operational Title &amp; Engagement Type
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={titleId}
            onChange={(e) => setTitleId(e.target.value)}
            className="min-h-9 rounded-lg border border-black/15 bg-white px-2 font-sans text-body-small"
          >
            <option value="">No title set</option>
            {operationalTitles.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={engagementId}
            onChange={(e) => setEngagementId(e.target.value)}
            className="min-h-9 rounded-lg border border-black/15 bg-white px-2 font-sans text-body-small"
          >
            <option value="">No engagement type set</option>
            {engagementTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={saveCollaboratorDetails}
            disabled={pending}
            className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4 disabled:opacity-50"
          >
            Save
          </button>
        </div>
        <p className="font-sans text-caption text-ordift-ink-muted">
          Describes the working relationship only — never affects permissions.
        </p>
      </section>

      {/* Project assignments */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted">
            Assigned Projects
          </h3>
          {assignments === null && (
            <button type="button" onClick={loadAssignments} className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
              Load
            </button>
          )}
        </div>

        {assignments && assignments.length === 0 && (
          <p className="font-sans text-caption text-ordift-ink-muted">No project assignments yet.</p>
        )}
        {assignments && assignments.length > 0 && (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white px-3 py-2">
                <div>
                  <p className="font-sans text-body-small text-ordift-ink">{a.entityLabel}</p>
                  <p className="font-sans text-caption text-ordift-ink-muted">
                    {ASSIGNMENT_STATUS_LABELS[a.status]}
                    {a.accessExpiresAt ? ` · expires ${new Date(a.accessExpiresAt).toLocaleDateString()}` : ""}
                    {a.roleNote ? ` · ${a.roleNote}` : ""}
                  </p>
                </div>
                {a.status === "active" || a.status === "invited" ? (
                  <button
                    type="button"
                    onClick={() => changeAssignmentStatus(a.id, "removed", "Removed by admin")}
                    className="font-sans text-caption text-red-700 underline underline-offset-4 shrink-0"
                  >
                    Remove from project
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-lg border border-black/10 bg-white p-3 space-y-2">
          <p className="font-sans text-caption font-semibold text-ordift-ink">Assign to a project</p>
          <input
            type="text"
            value={projectQuery}
            onChange={(e) => runProjectSearch(e.target.value)}
            placeholder="Search by reference number or client name…"
            className="w-full rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small"
          />
          {projectResults.length > 0 && !selectedProject && (
            <ul className="border border-black/10 rounded-lg divide-y divide-black/5 max-h-48 overflow-y-auto">
              {projectResults.map((p) => (
                <li key={`${p.entityType}-${p.entityId}`}>
                  <button
                    type="button"
                    onClick={() => setSelectedProject(p)}
                    className="w-full text-left px-3 py-2 font-sans text-body-small hover:bg-ordift-offwhite"
                  >
                    {p.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedProject && (
            <div className="space-y-2">
              <p className="font-sans text-body-small text-ordift-ink">
                Selected: <span className="font-medium">{selectedProject.label}</span>{" "}
                <button type="button" onClick={() => setSelectedProject(null)} className="text-caption text-ordift-ink-muted underline">
                  change
                </button>
              </p>
              <input
                type="text"
                value={assignNote}
                onChange={(e) => setAssignNote(e.target.value)}
                placeholder="Role on this project (optional)"
                className="w-full rounded-lg border border-black/15 px-3 py-1.5 font-sans text-body-small"
              />
              <div className="flex items-center gap-2">
                <label className="font-sans text-caption text-ordift-ink-muted">Access expires:</label>
                <input
                  type="date"
                  value={assignExpiry}
                  onChange={(e) => setAssignExpiry(e.target.value)}
                  className="rounded-lg border border-black/15 px-2 py-1 font-sans text-caption"
                />
              </div>
              <button
                type="button"
                onClick={confirmAssign}
                disabled={pending}
                className="font-sans text-body-small font-semibold px-3 py-1.5 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50"
              >
                {pending ? "Assigning…" : "Assign to project"}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* History */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-sans text-caption font-semibold uppercase tracking-wide text-ordift-ink-muted">
            Access-Change History
          </h3>
          {history === null && (
            <button type="button" onClick={loadHistory} className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
              Load
            </button>
          )}
        </div>
        {history && history.length === 0 && <p className="font-sans text-caption text-ordift-ink-muted">No history yet.</p>}
        {history && history.length > 0 && (
          <ul className="space-y-1.5">
            {history.map((h) => (
              <li key={h.id} className="font-sans text-caption text-ordift-ink-muted">
                <span className="text-ordift-ink">{h.action}</span> by {h.actorName ?? "unknown"} —{" "}
                {new Date(h.createdAt).toLocaleString()}
                {Object.keys(h.metadata).length > 0 && <span> ({JSON.stringify(h.metadata)})</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function InvitePanel({
  operationalTitles,
  engagementTypes,
  currentUserIsSuperAdmin,
  onDone,
}: {
  operationalTitles: LookupOption[];
  engagementTypes: LookupOption[];
  currentUserIsSuperAdmin: boolean;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<RoleSlug | "">("");
  const [titleId, setTitleId] = useState("");
  const [engagementId, setEngagementId] = useState("");

  function submit() {
    setError(null);
    const fd = new FormData();
    fd.set("email", email);
    fd.set("fullName", fullName);
    fd.set("role", role);
    fd.set("operationalTitleId", titleId);
    fd.set("engagementTypeId", engagementId);
    startTransition(async () => {
      const result = await inviteCollaboratorAction(fd);
      if (result.error) setError(result.error);
      else {
        setEmail("");
        setFullName("");
        setRole("");
        setTitleId("");
        setEngagementId("");
        onDone();
      }
    });
  }

  return (
    <div className="rounded-xl border border-black/10 bg-white p-5 space-y-3">
      <h2 className="font-serif font-medium text-body text-ordift-ink">Invite a Collaborator</h2>
      <p className="font-sans text-caption text-ordift-ink-muted">
        Sends a real Supabase Auth invite email — the person sets their own password. Never grants Client access.
      </p>
      {error && <p className="font-sans text-caption text-red-700">{error}</p>}
      <div className="grid sm:grid-cols-2 gap-3">
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name"
          className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as RoleSlug)}
          className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
        >
          <option value="">Role…</option>
          {ALL_GRANTABLE_ROLES.filter((r) => currentUserIsSuperAdmin || (r !== "admin" && r !== "super_admin")).map(
            (r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            )
          )}
        </select>
        <div />
        <select
          value={titleId}
          onChange={(e) => setTitleId(e.target.value)}
          className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
        >
          <option value="">Operational title (optional)</option>
          {operationalTitles.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={engagementId}
          onChange={(e) => setEngagementId(e.target.value)}
          className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
        >
          <option value="">Engagement type (optional)</option>
          {engagementTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={pending || !email || !fullName || !role}
        className="font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-navy-950 text-white disabled:opacity-50"
      >
        {pending ? "Sending invite…" : "Send Invite"}
      </button>
    </div>
  );
}

export default function UsersManager({
  users,
  currentUserId,
  currentUserIsSuperAdmin,
  operationalTitles,
  engagementTypes,
}: {
  users: AdminUserRow[];
  currentUserId: string;
  currentUserIsSuperAdmin: boolean;
  operationalTitles: LookupOption[];
  engagementTypes: LookupOption[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | AdminUserRow["accessStatus"]>("");
  const [roleFilter, setRoleFilter] = useState<"" | RoleSlug>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter && u.accessStatus !== statusFilter) return false;
      if (roleFilter && !u.roles.includes(roleFilter)) return false;
      if (!q) return true;
      return (
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.fullName ?? "").toLowerCase().includes(q) ||
        u.roles.some((r) => ROLE_LABELS[r].toLowerCase().includes(q))
      );
    });
  }, [users, query, statusFilter, roleFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, or role…"
          className="min-w-64 rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deactivated">Deactivated</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
          className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small"
        >
          <option value="">Any role</option>
          {(Object.keys(ROLE_LABELS) as RoleSlug[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowInvite((v) => !v)}
          className="ml-auto font-sans text-body-small font-semibold px-4 py-2 rounded-md bg-ordift-gold text-ordift-navy-950 hover:bg-ordift-gold-hover"
        >
          {showInvite ? "Close" : "Invite Collaborator"}
        </button>
      </div>

      {showInvite && (
        <InvitePanel
          operationalTitles={operationalTitles}
          engagementTypes={engagementTypes}
          currentUserIsSuperAdmin={currentUserIsSuperAdmin}
          onDone={() => setShowInvite(false)}
        />
      )}

      <p className="font-sans text-caption text-ordift-ink-muted">
        {filtered.length} of {users.length} accounts
      </p>

      <div className="rounded-xl border border-black/10 bg-white divide-y divide-black/5">
        {filtered.map((u) => (
          <div key={u.id}>
            <button
              type="button"
              onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
              className="w-full flex flex-wrap items-center gap-3 px-5 py-4 text-left hover:bg-ordift-offwhite/60"
            >
              <div className="min-w-48">
                <p className="font-sans text-body-small text-ordift-ink font-medium">
                  {u.fullName ?? "—"} {u.id === currentUserId && <span className="text-ordift-ink-muted">(you)</span>}
                </p>
                <p className="font-sans text-caption text-ordift-ink-muted">{u.email ?? "—"}</p>
              </div>
              <StatusBadge status={u.accessStatus} />
              <span className="font-sans text-caption text-ordift-ink-muted">
                {u.emailConfirmedAt ? "Email verified" : "Email unverified"}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {u.roles.length === 0 && <span className="font-sans text-caption text-ordift-ink-muted">No roles</span>}
                {u.roles.map((r) => (
                  <span key={r} className="px-2 py-0.5 rounded-full bg-ordift-offwhite font-sans text-caption text-ordift-ink">
                    {ROLE_LABELS[r]}
                  </span>
                ))}
              </div>
              {(u.operationalTitleName || u.engagementTypeName) && (
                <span className="font-sans text-caption text-ordift-ink-muted">
                  {[u.operationalTitleName, u.engagementTypeName].filter(Boolean).join(" · ")}
                </span>
              )}
              <span className="ml-auto font-sans text-caption text-ordift-gold-pressed underline underline-offset-4">
                {expandedId === u.id ? "Close" : "Manage"}
              </span>
            </button>
            {expandedId === u.id && (
              <UserDetail
                user={u}
                currentUserIsSuperAdmin={currentUserIsSuperAdmin}
                operationalTitles={operationalTitles}
                engagementTypes={engagementTypes}
              />
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="px-5 py-8 text-center font-sans text-body-small text-ordift-ink-muted">No accounts match.</p>
        )}
      </div>
    </div>
  );
}
