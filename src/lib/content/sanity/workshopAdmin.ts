import { client } from "@/sanity/lib/client";
import type { Workshop, Venue, Category } from "../types";
import {
  workshopsQuery,
  workshopBySlugQuery,
  workshopByIdQuery,
  workshopInternalNotesByIdQuery,
  venuesQuery,
  workshopCategoriesQuery,
} from "./queries";

// Workshop Management V1, Phase B, Part 19 (2026-08-25) — admin-only
// Sanity read/write for the new /admin/workshops surface, following
// src/lib/content/sanity/portfolioAdmin.ts's exact precedent (the only
// existing Sanity-backed admin CRUD module) — a thin, generic write
// layer, never a duplicate Supabase content table. Server-only:
// `client` carries a write-capable SANITY_API_TOKEN, never usable from
// a Client Component.
//
// Scope note: this covers the CORE operational fields (title, slug,
// status, descriptions, venue, capacity, dates, currency/timezone,
// requiresPayment, terms/internal notes) — matching "keep V1 small."
// Rich content (gallery, agenda, FAQs, testimonials, sponsors,
// instructor bios) remains Studio-edited, exactly as it already is
// today; this module doesn't attempt full field parity with Studio.

export async function getAllWorkshopsAdmin(): Promise<Workshop[]> {
  return client.fetch<Workshop[]>(workshopsQuery);
}

export async function getWorkshopBySlugAdmin(slug: string): Promise<Workshop | null> {
  return client.fetch<Workshop | null>(workshopBySlugQuery, { slug });
}

export async function getWorkshopByIdAdmin(id: string): Promise<Workshop | null> {
  return client.fetch<Workshop | null>(workshopByIdQuery, { id });
}

// Closure refinement (2026-08-25) — the one narrow, explicit read of
// internalNotes, used only by the Edit Workshop form so a previously-
// saved value actually loads instead of being silently blanked on
// every save (the bug this fixes). Deliberately a separate call rather
// than widening workshopByIdQuery/the Workshop type, which both stay
// exactly as public-safe as before.
export async function getWorkshopInternalNotesAdmin(id: string): Promise<string | null> {
  const result = await client.fetch<{ internalNotes: string | null } | null>(workshopInternalNotesByIdQuery, { id });
  return result?.internalNotes ?? null;
}

export async function getVenuesAdmin(): Promise<Venue[]> {
  return client.fetch<Venue[]>(venuesQuery);
}

export async function getWorkshopCategoriesAdmin(): Promise<Category[]> {
  return client.fetch<Category[]>(workshopCategoriesQuery);
}

export type WorkshopCoreFields = {
  title: string;
  slug: string;
  status: string;
  shortDescription: string;
  description: string;
  venueId: string | null;
  capacity: number;
  displayCurrency: string | null;
  timezone: string | null;
  startDate: string | null;
  endDate: string | null;
  registrationOpensAt: string | null;
  registrationDeadline: string | null;
  requiresPayment: boolean;
  attendeeTerms: string | null;
  internalNotes: string | null;
};

export async function createWorkshopDraft(fields: WorkshopCoreFields): Promise<string> {
  const doc = await client.create({
    _type: "workshop",
    title: fields.title,
    slug: { current: fields.slug },
    status: fields.status,
    shortDescription: fields.shortDescription,
    description: fields.description,
    venue: fields.venueId ? { _type: "reference", _ref: fields.venueId } : undefined,
    capacity: fields.capacity,
    displayCurrency: fields.displayCurrency || undefined,
    timezone: fields.timezone || undefined,
    startDate: fields.startDate || undefined,
    endDate: fields.endDate || undefined,
    registrationOpensAt: fields.registrationOpensAt || undefined,
    registrationDeadline: fields.registrationDeadline || undefined,
    requiresPayment: fields.requiresPayment,
    attendeeTerms: fields.attendeeTerms || undefined,
    internalNotes: fields.internalNotes || undefined,
  });
  return doc._id;
}

export async function patchWorkshopCoreFields(id: string, fields: WorkshopCoreFields): Promise<void> {
  await client
    .patch(id)
    .set({
      title: fields.title,
      slug: { current: fields.slug },
      status: fields.status,
      shortDescription: fields.shortDescription,
      description: fields.description,
      venue: fields.venueId ? { _type: "reference", _ref: fields.venueId } : undefined,
      capacity: fields.capacity,
      displayCurrency: fields.displayCurrency || null,
      timezone: fields.timezone || null,
      startDate: fields.startDate || null,
      endDate: fields.endDate || null,
      registrationOpensAt: fields.registrationOpensAt || null,
      registrationDeadline: fields.registrationDeadline || null,
      requiresPayment: fields.requiresPayment,
      attendeeTerms: fields.attendeeTerms || null,
      internalNotes: fields.internalNotes || null,
    })
    .commit();
}
