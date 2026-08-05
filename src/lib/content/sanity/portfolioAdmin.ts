import { client } from "@/sanity/lib/client";
import type { Category, Collection, PortfolioProject, PortfolioStatus, Testimonial } from "../types";
import {
  allPortfolioProjectsQuery,
  portfolioCategoriesQuery,
  portfolioCollectionsQuery,
  portfolioProjectByIdQuery,
  portfolioProjectEditQuery,
  portfolioSlugExistsQuery,
  testimonialsQuery,
} from "./queries";

// Admin-only Sanity read/write access for the Portfolio Management
// System (src/app/admin/portfolio/**). Deliberately separate from
// src/lib/content/repository.ts (the public, CMS-agnostic, read-only
// abstraction that also has a local-fixture adapter) — this module is
// Sanity-specific by design (it needs mutation, and there is no
// meaningful "local" equivalent of a review workflow), and every
// export here must only ever be called from server-only code (Server
// Actions / Route Handlers), never a Client Component, since `client`
// carries a write-capable SANITY_API_TOKEN. Sanity itself stays the
// content source of truth throughout.
//
// Native creation/editing (2026-08-05): `patchPortfolioProject` accepts
// a raw Sanity-shaped partial document — the form component
// (PortfolioProjectForm.tsx) is responsible for building correctly
// shaped field values (mediaAsset objects, galleryImage array items
// with `_key`, reference arrays), matching
// src/sanity/schemaTypes/documents/portfolioProject.ts field-for-field.
// This module stays a thin, generic write layer rather than knowing
// about individual fields, so schema changes don't require touching it.

export async function getAllPortfolioProjectsAdmin(): Promise<PortfolioProject[]> {
  return client.fetch<PortfolioProject[]>(allPortfolioProjectsQuery);
}

export async function getPortfolioProjectByIdAdmin(id: string): Promise<PortfolioProject | null> {
  return client.fetch<PortfolioProject | null>(portfolioProjectByIdQuery, { id });
}

// Edit-mode fetch — see portfolioProjectEditQuery's own comment. Typed
// loosely (the wizard's own mapper narrows this into FormState) since
// this shape is specific to the edit form, not a reusable domain type.
export async function getPortfolioProjectForEdit(id: string): Promise<Record<string, unknown> | null> {
  return client.fetch<Record<string, unknown> | null>(portfolioProjectEditQuery, { id });
}

export async function getPortfolioCategoriesAdmin(): Promise<Category[]> {
  return client.fetch<Category[]>(portfolioCategoriesQuery);
}

export async function getPortfolioCollectionsAdmin(): Promise<Collection[]> {
  return client.fetch<Collection[]>(portfolioCollectionsQuery);
}

// Reference-picker data for the wizard's Team & Deliverables step
// (testimonials) and Categories & Organisation step (related projects
// — reuses the same admin project list, filtered client-side to
// exclude the project being edited).
export async function getTestimonialsAdmin(): Promise<Testimonial[]> {
  return client.fetch<Testimonial[]>(testimonialsQuery);
}

export async function setPortfolioProjectStatus(id: string, status: PortfolioStatus): Promise<void> {
  await client.patch(id).set({ status }).commit();
}

export async function setPortfolioProjectFeatured(id: string, featured: boolean): Promise<void> {
  await client.patch(id).set({ featured }).commit();
}

export async function setPortfolioProjectScheduledFor(id: string, scheduledFor: string | null): Promise<void> {
  if (scheduledFor) {
    await client.patch(id).set({ scheduledFor }).commit();
  } else {
    await client.patch(id).unset(["scheduledFor"]).commit();
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Used by both the wizard's live slug-availability check and server-side
// re-validation on save — a race between two editors is acceptable to
// leave undetected here (Sanity has no unique-field constraint), but an
// obviously-taken slug should never silently overwrite another project.
export async function isSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
  const existingId = await client.fetch<string | null>(portfolioSlugExistsQuery, { slug });
  if (!existingId) return true;
  return existingId === excludeId;
}

export async function createPortfolioProjectDraft(title: string, slug: string): Promise<string> {
  const doc = await client.create({
    _type: "portfolioProject",
    title,
    slug: { _type: "slug", current: slug },
    status: "draft",
    featured: false,
    disciplines: [],
    servicesProvided: [],
    equipmentUsed: [],
    tags: [],
    deliverables: [],
    isPasswordProtected: false,
  });
  return doc._id;
}

// `fields` must already be in raw Sanity shape (see module comment).
// A plain `.set()` — every key present in `fields` overwrites that field
// entirely; fields not present are left untouched, which is what lets
// the edit form save one wizard step at a time without clobbering data
// from other steps.
export async function patchPortfolioProject(id: string, fields: Record<string, unknown>): Promise<void> {
  if (Object.keys(fields).length === 0) return;
  await client.patch(id).set(fields).commit();
}

export async function deletePortfolioProjectFully(id: string): Promise<void> {
  await client.delete(id);
}

export async function createPortfolioCategory(name: string, description: string): Promise<string> {
  const doc = await client.create({
    _type: "portfolioCategory",
    name,
    slug: { _type: "slug", current: slugify(name) },
    description: description || undefined,
  });
  return doc._id;
}

export async function deletePortfolioCategory(id: string): Promise<void> {
  await client.delete(id);
}

export async function createPortfolioCollection(
  name: string,
  description: string,
  isOrdered: boolean
): Promise<string> {
  const doc = await client.create({
    _type: "portfolioCollection",
    name,
    slug: { _type: "slug", current: slugify(name) },
    description: description || undefined,
    isOrdered,
  });
  return doc._id;
}

export async function deletePortfolioCollection(id: string): Promise<void> {
  await client.delete(id);
}
