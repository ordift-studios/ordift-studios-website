import { detailQuestionsFor } from "./config";

// The client-visible event details a Crew Support quotation quotes for.
// Built from the request and FROZEN onto the quotation at issue
// (client_quotations.project_snapshot), so a later edit to the request
// can never change what an issued quotation says. Client-safe only: no
// budget notes, requester notes, crew names, costs or internal data.
export type ProjectSnapshot = {
  requestReference: string;
  projectName: string;
  projectType: string | null;
  serviceLabel: string;
  startDate: string;
  endDate: string;
  callTime: string | null;
  finishTime: string | null;
  location: string;
  onSiteContact: string | null;
  urgency: string;
  equipment: string | null; // who supplies equipment, in words; null = not specified
  equipmentRequired: boolean; // the service family asks this question as mandatory
  roles: { role: string; quantity: number; responsibilities: string | null }[];
};

type RequestLike = Record<string, unknown>;
type RequirementLike = { role_label: string; custom_role?: string | null; quantity: number; responsibilities?: string | null };

export function equipmentLabel(request: RequestLike): string | null {
  const family = String(request.service_family ?? "");
  const answer = ((request.service_details ?? {}) as Record<string, string>).equipment;
  if (!answer) return null;
  const q = detailQuestionsFor(family).find((x) => x.id === "equipment");
  return q?.options?.find((o) => o.value === answer)?.label ?? answer;
}

export function buildProjectSnapshot(request: RequestLike, requirements: RequirementLike[], serviceLabel: string): ProjectSnapshot {
  const s = (k: string) => (request[k] == null || request[k] === "" ? null : String(request[k]));
  return {
    requestReference: String(request.reference_number ?? ""),
    projectName: String(request.project_name ?? ""),
    projectType: s("project_type"),
    serviceLabel,
    startDate: String(request.start_date ?? ""),
    endDate: String(request.end_date ?? ""),
    callTime: s("call_time"),
    finishTime: s("finish_time"),
    location: String(request.location ?? ""),
    onSiteContact: s("on_site_contact"),
    urgency: String(request.urgency ?? "standard"),
    equipment: equipmentLabel(request),
    equipmentRequired: detailQuestionsFor(String(request.service_family ?? "")).some((q) => q.id === "equipment" && q.required),
    roles: requirements.map((r) => ({ role: r.custom_role && r.custom_role !== r.role_label ? `${r.role_label} (${r.custom_role})` : r.role_label, quantity: Number(r.quantity), responsibilities: r.responsibilities ? String(r.responsibilities) : null })),
  };
}

// Why a quotation can't be issued yet because the event information is
// incomplete. null = complete.
export function snapshotGap(s: ProjectSnapshot): string | null {
  if (!s.projectName.trim()) return "the project name is missing";
  if (!s.startDate || !s.endDate) return "the event date is missing";
  if (!s.location.trim()) return "the event location is missing";
  if (s.roles.length === 0) return "no crew roles are listed";
  if (s.equipmentRequired && !s.equipment) return "the equipment responsibility (who supplies equipment) isn't recorded — set it on the request first";
  return null;
}

export function isProjectSnapshot(value: unknown): value is ProjectSnapshot {
  const v = value as ProjectSnapshot | null;
  return Boolean(v && typeof v === "object" && typeof v.projectName === "string" && Array.isArray(v.roles));
}

export function snapshotScheduleText(s: ProjectSnapshot): string {
  const dates = s.startDate === s.endDate ? s.startDate : `${s.startDate} → ${s.endDate}`;
  const times = [s.callTime, s.finishTime].filter(Boolean).join(" → ");
  return times ? `${dates}, ${times}` : dates;
}
