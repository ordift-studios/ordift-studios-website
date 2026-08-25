import { z } from "zod";

// Visitor-submitted fields only. Registration Status, Payment Status,
// Amount Due/Paid, Waiting-List Status, Attendance Status and Internal
// Notes are system/admin-managed (see storage.ts + WORKSHOPS_ARCHITECTURE.md)
// — never asked of the visitor, same principle as the enquiry form's
// internal management columns.
//
// Workshop Management V1, Phase B (2026-08-25): fullName is replaced by
// firstName/middleName/surname (explicit fields rather than guessing a
// split — a joined string is ambiguous for compound/multi-part names).
// full_name is still computed and stored server-side for backward
// compatibility with every existing reader of that column. ticketTypeId
// and the optional travel-assistance fields are new and additive —
// omitting them keeps working exactly as before for a workshop with no
// configured ticket types.
export const workshopRegistrationSchema = z.object({
  workshopSlug: z.string().trim().min(1, "Missing workshop reference."),

  firstName: z.string().trim().min(1, "Please enter your first name.").max(100),
  middleName: z.string().trim().max(100).optional().or(z.literal("")),
  surname: z.string().trim().min(1, "Please enter your surname.").max(100),
  email: z.string().trim().email("Please enter a valid email address."),
  phoneCountryCode: z.string().trim().max(6).optional().or(z.literal("")),
  phone: z.string().trim().min(6, "Please enter a phone or WhatsApp number.").max(40),
  country: z.string().trim().max(200).optional().or(z.literal("")),
  experienceLevel: z
    .enum(["beginner", "intermediate", "advanced", "all-levels"])
    .optional(),

  ticketTypeId: z.string().trim().uuid().optional().or(z.literal("")),

  // Travel/accommodation/transport assistance — REQUEST CAPTURE ONLY,
  // per explicit instruction. assistanceType left unset/omitted means
  // "no assistance required" — no row is created in that case.
  assistanceType: z.enum(["accommodation", "transport", "both"]).optional(),
  arrivalDate: z.string().trim().max(20).optional().or(z.literal("")),
  departureDate: z.string().trim().max(20).optional().or(z.literal("")),
  travellerCount: z.coerce.number().int().min(1).max(20).optional(),
  assistanceNotes: z.string().trim().max(1000).optional().or(z.literal("")),

  // Required: permission to process this registration (same principle as
  // the enquiry form's required privacy consent).
  consent: z.literal(true, {
    error: "Please confirm you've read the Privacy Notice to continue.",
  }),

  idempotencyKey: z.string().trim().max(100).optional().or(z.literal("")),

  // Honeypot — must stay empty.
  website: z.string().max(0).optional().or(z.literal("")),

  // Cloudflare Turnstile response token — verified server-side in
  // src/app/api/workshop-registration/route.ts via src/lib/turnstile.ts.
  turnstileToken: z.string().optional().or(z.literal("")),
});

export type WorkshopRegistrationInput = z.infer<typeof workshopRegistrationSchema>;
