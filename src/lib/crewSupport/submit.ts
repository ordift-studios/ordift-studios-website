import { crewSupportSchema, pickServiceDetails } from "./schema";
import { SUBMITTED_MESSAGE } from "./config";

export type CrewSupportRecord = {
  requestId: string;
  referenceNumber: string;
  submittedAt: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  requesterCompany: string;
  leadCompany: string;
  requesterType: string;
  serviceFamily: string;
  projectName: string;
  startDate: string;
  endDate: string;
  location: string;
  requirements: { roleLabel: string; quantity: number }[];
};

export type CrewSupportDeps = {
  generateReference: () => Promise<string>;
  findUserId: (email: string) => Promise<string | null>;
  resolveTitleLabels: (titleIds: string[]) => Promise<Record<string, string>>;
  create: (request: Record<string, unknown>, requirements: Record<string, unknown>[]) => Promise<{ ok: true; requestId: string } | { ok: false; error: string }>;
  now?: () => Date;
};

export type SubmitResult =
  | { ok: true; referenceNumber: string; message: string; record: CrewSupportRecord }
  | { ok: false; status: 422; error: "validation-failed"; fieldErrors: Record<string, string[]> }
  | { ok: false; status: 503; error: "save-failed"; message: string };

// Pure orchestration (no framework, no DB) so the whole submission path —
// validation, role resolution, atomic create, write-failure handling — is
// directly testable. The caller (route.ts) owns rate limiting, CAPTCHA,
// idempotency and notifications; success is returned ONLY after the
// atomic create succeeds, and the message never says "booked"/"confirmed".
export async function submitCrewSupportRequest(input: unknown, deps: CrewSupportDeps): Promise<SubmitResult> {
  const parsed = crewSupportSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, status: 422, error: "validation-failed", fieldErrors };
  }
  const data = parsed.data;
  const now = (deps.now ?? (() => new Date()))();

  try {
    const titleIds = data.requirements.map((r) => r.titleId).filter((id): id is string => Boolean(id));
    const labels = titleIds.length ? await deps.resolveTitleLabels(titleIds) : {};
    const requirements = data.requirements.map((r) => {
      const configured = r.titleId ? labels[r.titleId] : undefined;
      return {
        operational_title_id: configured ? r.titleId : "",
        role_label: configured ?? (r.customRole?.trim() || "Other"),
        custom_role: r.customRole?.trim() || "",
        quantity: r.quantity,
        responsibilities: r.responsibilities?.trim() || "",
        equipment_note: "",
      };
    });

    const referenceNumber = await deps.generateReference();
    const userId = await deps.findUserId(data.email);
    const submittedAt = now.toISOString();

    const created = await deps.create(
      {
        user_id: userId ?? "",
        reference_number: referenceNumber,
        requester_type: data.requesterType,
        requester_name: data.fullName,
        requester_email: data.email,
        requester_phone: data.phone,
        requester_company: data.companyName ?? "",
        lead_company: data.leadCompany ?? "",
        service_family: data.serviceFamily,
        project_name: data.projectName,
        project_type: data.projectType ?? "",
        project_description: data.projectDescription ?? "",
        start_date: data.startDate,
        end_date: data.endDate,
        call_time: data.callTime ?? "",
        finish_time: data.finishTime ?? "",
        location: data.location,
        on_site_contact: data.onSiteContact ?? "",
        urgency: data.urgency,
        budget_note: data.budgetNote ?? "",
        requester_notes: data.requesterNotes ?? "",
        service_details: pickServiceDetails(data.serviceFamily, data.serviceDetails),
        consent_accepted_at: submittedAt,
        idempotency_key: data.idempotencyKey ?? "",
        submitted_at: submittedAt,
      },
      requirements
    );
    if (!created.ok) {
      console.error("[crew-support] failed to save request", referenceNumber, created.error);
      return { ok: false, status: 503, error: "save-failed", message: "We couldn't save your request. Please try again or email us directly." };
    }

    return {
      ok: true,
      referenceNumber,
      message: SUBMITTED_MESSAGE,
      record: {
        requestId: created.requestId,
        referenceNumber,
        submittedAt,
        requesterName: data.fullName,
        requesterEmail: data.email,
        requesterPhone: data.phone,
        requesterCompany: data.companyName ?? "",
        leadCompany: data.leadCompany ?? "",
        requesterType: data.requesterType,
        serviceFamily: data.serviceFamily,
        projectName: data.projectName,
        startDate: data.startDate,
        endDate: data.endDate,
        location: data.location,
        requirements: requirements.map((r) => ({ roleLabel: r.role_label, quantity: r.quantity })),
      },
    };
  } catch (error) {
    console.error("[crew-support] unexpected failure", error);
    return { ok: false, status: 503, error: "save-failed", message: "We couldn't save your request. Please try again or email us directly." };
  }
}
