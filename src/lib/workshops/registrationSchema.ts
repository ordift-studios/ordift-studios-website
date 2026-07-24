import { z } from "zod";

// Visitor-submitted fields only. Registration Status, Payment Status,
// Amount Due/Paid, Waiting-List Status, Attendance Status and Internal
// Notes are system/admin-managed (see storage.ts + WORKSHOPS_ARCHITECTURE.md)
// — never asked of the visitor, same principle as the enquiry form's
// internal management columns.
export const workshopRegistrationSchema = z.object({
  workshopSlug: z.string().trim().min(1, "Missing workshop reference."),

  fullName: z.string().trim().min(2, "Please enter your full name.").max(200),
  email: z.string().trim().email("Please enter a valid email address."),
  phone: z.string().trim().min(6, "Please enter a phone or WhatsApp number.").max(40),
  country: z.string().trim().max(200).optional().or(z.literal("")),
  experienceLevel: z
    .enum(["beginner", "intermediate", "advanced", "all-levels"])
    .optional(),

  // Required: permission to process this registration (same principle as
  // the enquiry form's required privacy consent).
  consent: z.literal(true, {
    error: "Please confirm you've read the Privacy Notice to continue.",
  }),

  idempotencyKey: z.string().trim().max(100).optional().or(z.literal("")),

  // Honeypot — must stay empty.
  website: z.string().max(0).optional().or(z.literal("")),
});

export type WorkshopRegistrationInput = z.infer<typeof workshopRegistrationSchema>;
