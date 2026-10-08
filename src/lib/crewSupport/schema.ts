import { z } from "zod";
import { REQUESTER_TYPES, URGENCY_OPTIONS, isServiceFamily, detailQuestionsFor } from "./config";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time.").optional().or(z.literal(""));

export const requirementSchema = z
  .object({
    // Existing operational_titles id when a configured role is chosen.
    titleId: z.string().uuid().optional().or(z.literal("")),
    customRole: optionalText(120),
    quantity: z.coerce.number().int("Enter a whole number.").min(1, "At least 1.").max(50, "Please contact us directly for requests this large."),
    responsibilities: optionalText(1000),
  })
  .refine((r) => Boolean(r.titleId) || Boolean(r.customRole?.trim()), { message: "Choose a role or describe it.", path: ["customRole"] });

export const crewSupportSchema = z
  .object({
    requesterType: z.enum(REQUESTER_TYPES.map((r) => r.value) as [string, ...string[]], { error: "Please choose who is requesting support." }),
    fullName: z.string().trim().min(2, "Please enter your full name.").max(200),
    email: z.string().trim().email("Please enter a valid email address."),
    phone: z.string().trim().min(6, "Please enter a phone or WhatsApp number.").max(40),
    companyName: optionalText(200),
    leadCompany: optionalText(200),
    serviceFamily: z.string().refine(isServiceFamily, "Please choose a service area."),
    projectName: z.string().trim().min(2, "Give the project or event a short name.").max(200),
    projectType: optionalText(200),
    projectDescription: optionalText(2000),
    startDate: isoDate,
    endDate: isoDate,
    callTime: timeOfDay,
    finishTime: timeOfDay,
    location: z.string().trim().min(2, "Where will the work take place?").max(300),
    onSiteContact: optionalText(300),
    urgency: z.enum(URGENCY_OPTIONS.map((u) => u.value) as [string, ...string[]]).default("standard"),
    budgetNote: optionalText(500),
    requesterNotes: optionalText(2000),
    requirements: z.array(requirementSchema).min(1, "Add at least one crew requirement.").max(10, "Up to 10 requirements per request."),
    serviceDetails: z.record(z.string(), z.string().max(1000)).optional().default({}),
    consent: z.literal(true, { error: "Please confirm you've read the Privacy Notice to continue." }),
    idempotencyKey: z.string().trim().max(100).optional().or(z.literal("")),
    website: z.string().max(0).optional().or(z.literal("")),
    turnstileToken: z.string().optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.startDate && data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({ code: "custom", message: "The end date can't be before the start date.", path: ["endDate"] });
    }
    const today = new Date().toISOString().slice(0, 10);
    if (data.startDate && data.startDate < today) {
      ctx.addIssue({ code: "custom", message: "The start date can't be in the past.", path: ["startDate"] });
    }
    // Questions that carry a commercial responsibility (for example who
    // supplies equipment) are mandatory: left blank they silently dropped
    // out of the request and the quotation (QA 2026-10-08, CSR-2026-000003).
    for (const q of detailQuestionsFor(data.serviceFamily)) {
      if (q.required && !(data.serviceDetails?.[q.id] ?? "").trim()) {
        ctx.addIssue({ code: "custom", message: "Please choose an option.", path: ["serviceDetails", q.id] });
      }
    }
    const total = data.requirements.reduce((sum, r) => sum + r.quantity, 0);
    if (total > 100) ctx.addIssue({ code: "custom", message: "Please contact us directly for requests this large.", path: ["requirements"] });
  });

export type CrewSupportInput = z.infer<typeof crewSupportSchema>;

// Keeps only the conditional answers that belong to the chosen service
// family — a Production request never carries stray photography answers.
export function pickServiceDetails(family: string, details: Record<string, string>): Record<string, string> {
  const allowed = new Set(detailQuestionsFor(family).map((q) => q.id));
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(details)) {
    const v = value.trim();
    if (allowed.has(key) && v) out[key] = v;
  }
  return out;
}
