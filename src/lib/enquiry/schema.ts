import { z } from "zod";
import { isPathwayValue } from "./pathways";
import { isBudgetRangeValue } from "./budgetRanges";

// Required vs. optional fields per the approved spec (2026-07-23):
// required — full name, email, phone/WhatsApp, service, project
// description, consent. Everything else is optional so the form doesn't
// read like a corporate questionnaire.

export const enquirySchema = z.object({
  // Step 1 — Choose a service
  service: z
    .string()
    .min(1, "Please choose a service.")
    .refine(isPathwayValue, "Please choose a valid service."),

  // Step 2 — Tell us about the project
  projectType: z.string().trim().max(200).optional().or(z.literal("")),
  projectLocation: z.string().trim().max(200).optional().or(z.literal("")),
  description: z
    .string()
    .trim()
    .min(20, "Tell us a little more — at least 20 characters.")
    .max(4000, "That's a lot — please keep it under 4000 characters."),
  referenceLink: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(""))
    .refine((val) => {
      if (!val) return true;
      try {
        const url = new URL(val);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }, "That doesn't look like a valid link (include https://)."),

  // Step 3 — Timing and budget
  timeframe: z.string().trim().max(200).optional().or(z.literal("")),
  budgetRange: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((val) => !val || isBudgetRangeValue(val), "Please choose a valid budget range."),

  // Step 4 — Contact information
  fullName: z
    .string()
    .trim()
    .min(2, "Please enter your full name.")
    .max(200),
  companyName: z.string().trim().max(200).optional().or(z.literal("")),
  email: z.string().trim().email("Please enter a valid email address."),
  phone: z
    .string()
    .trim()
    .min(6, "Please enter a phone or WhatsApp number.")
    .max(40),
  country: z.string().trim().max(200).optional().or(z.literal("")),
  hearAboutUs: z.string().trim().max(200).optional().or(z.literal("")),

  // Step 5 — Review and submit
  // Required: permission to process this enquiry. Separate from
  // marketing consent below — submitting an enquiry must never
  // auto-subscribe anyone to marketing communication.
  consent: z.literal(true, {
    error: "Please confirm you've read the Privacy Notice to continue.",
  }),
  // Optional: permission to receive future news/workshops/promotions.
  // Defaults to false/unchecked — opt-in only, never pre-checked.
  marketingConsent: z.boolean().optional().default(false),

  // Auto-captured, not a visible form field — which page sent the
  // visitor to /book (Google Sheet "Source Page" column).
  sourcePage: z.string().trim().max(300).optional().or(z.literal("")),

  // Client-generated once per form session, unrelated to form content.
  // Lets the server recognize "this is the same submission being
  // retried" and skip creating a duplicate enquiry (see storage.ts).
  idempotencyKey: z.string().trim().max(100).optional().or(z.literal("")),

  // Anti-spam — must stay empty. Never surfaced in the real UI.
  website: z.string().max(0).optional().or(z.literal("")),

  // Cloudflare Turnstile response token — verified server-side in
  // src/app/api/enquiry/route.ts via src/lib/turnstile.ts. Not a form
  // field the visitor fills in, so it's excluded from STEP_FIELDS.
  turnstileToken: z.string().optional().or(z.literal("")),
});

export type EnquiryInput = z.infer<typeof enquirySchema>;

// Per-step field groups, used to validate one step at a time in the UI
// without forcing the visitor to see errors for steps they haven't
// reached yet.
export const STEP_FIELDS = {
  1: ["service"],
  2: ["projectType", "projectLocation", "description", "referenceLink"],
  3: ["timeframe", "budgetRange"],
  4: ["fullName", "companyName", "email", "phone", "country", "hearAboutUs"],
  5: ["consent", "marketingConsent"],
} as const satisfies Record<number, (keyof EnquiryInput)[]>;
