import { client } from "@/sanity/lib/client";
import type { Category, Collection, PortfolioProject, PortfolioStatus } from "../types";
import {
  allPortfolioProjectsQuery,
  portfolioCategoriesQuery,
  portfolioCollectionsQuery,
  portfolioProjectByIdQuery,
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
// content source of truth throughout — these functions only ever
// touch the `status`, `featured`, and `scheduledFor` fields already
// defined on portfolioProject; every other field is still edited in
// Sanity Studio.

export async function getAllPortfolioProjectsAdmin(): Promise<PortfolioProject[]> {
  return client.fetch<PortfolioProject[]>(allPortfolioProjectsQuery);
}

export async function getPortfolioProjectByIdAdmin(id: string): Promise<PortfolioProject | null> {
  return client.fetch<PortfolioProject | null>(portfolioProjectByIdQuery, { id });
}

export async function getPortfolioCategoriesAdmin(): Promise<Category[]> {
  return client.fetch<Category[]>(portfolioCategoriesQuery);
}

export async function getPortfolioCollectionsAdmin(): Promise<Collection[]> {
  return client.fetch<Collection[]>(portfolioCollectionsQuery);
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

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function createPortfolioCategory(name: string, description: string): Promise<void> {
  await client.create({
    _type: "portfolioCategory",
    name,
    slug: { _type: "slug", current: slugify(name) },
    description: description || undefined,
  });
}

export async function deletePortfolioCategory(id: string): Promise<void> {
  await client.delete(id);
}

export async function createPortfolioCollection(
  name: string,
  description: string,
  isOrdered: boolean
): Promise<void> {
  await client.create({
    _type: "portfolioCollection",
    name,
    slug: { _type: "slug", current: slugify(name) },
    description: description || undefined,
    isOrdered,
  });
}

export async function deletePortfolioCollection(id: string): Promise<void> {
  await client.delete(id);
}
