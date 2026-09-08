import { defineField, defineType } from "sanity";

// Ordift Talent — TALENT-SYS-2B, Phase 1 (2026-09-08). The PUBLIC
// portfolio half of a represented talent's record — the private half
// (representation status, commercial terms, measurements, digitals,
// agreements) lives in Supabase (model_profiles + TALENT-SYS-1/2B's
// extensions) and is never duplicated here. profileId is the plain-
// string link between the two — no FK, matching how every other piece
// of Sanity content already relates to nothing in Postgres.
//
// status mirrors portfolioProject's own vocabulary exactly (see
// src/lib/talent/talentPublicationLifecycle.ts) — creating this
// document never publishes it; only "published" is publicly visible
// (see the talentProfilesQuery / getPublishedTalentBySlug()).
export default defineType({
  name: "talentProfile",
  title: "Talent Profile",
  type: "document",
  fields: [
    defineField({
      name: "profileId",
      title: "Talent Profile ID",
      type: "string",
      description: "The matching profiles.id (UUID) in Production — links this public portfolio to the private Talent record. Set once by an admin, from the Talent Management area.",
      validation: (r) => r.required(),
    }),
    defineField({ name: "name", title: "Name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "slug", title: "Slug", type: "slug", options: { source: "name" }, validation: (r) => r.required() }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      options: {
        list: [
          { title: "Draft", value: "draft" },
          { title: "Pending Review", value: "pending_review" },
          { title: "Approved", value: "approved" },
          { title: "Published", value: "published" },
          { title: "Archived", value: "archived" },
        ],
      },
      initialValue: "draft",
      validation: (r) => r.required(),
      description: "Only \"published\" is publicly visible on /talent and /talent/[slug].",
    }),
    defineField({
      name: "category",
      title: "Category",
      type: "string",
      description: "Free text matching a talent_categories.slug already defined in Talent Management (Our Roster's filter reads from that admin-configurable list, not from a second taxonomy defined here).",
    }),
    defineField({ name: "location", title: "Location", type: "string", description: "e.g. \"Accra · London\" — short, public-facing." }),
    defineField({ name: "availabilityNote", title: "Availability Note", type: "string", description: "Short public-facing note, e.g. \"Available October\". Leave blank to show nothing." }),
    defineField({ name: "heroImage", title: "Hero Image", type: "image", options: { hotspot: true }, validation: (r) => r.required() }),
    defineField({ name: "introduction", title: "Introduction", type: "text", rows: 4, description: "A short editorial introduction — the Atelier-influenced opening on the profile." }),
    defineField({
      name: "gallery",
      title: "Portfolio Gallery",
      type: "array",
      of: [{ type: "talentGalleryImage" }],
      description: "Editorial/fashion/commercial work — never Digitals (casting references), which live privately in Talent Management.",
    }),
    defineField({
      name: "reelEmbedUrl",
      title: "Reel — Embed URL",
      type: "url",
      description: "An external embed URL (e.g. Vimeo/YouTube), matching the existing Ordift precedent of embed-only video — native video upload is out of scope for this phase.",
    }),
    defineField({
      name: "developmentStage",
      title: "Development Stage",
      type: "string",
      options: {
        list: [
          { title: "New Faces / Development", value: "new_faces" },
          { title: "Established", value: "established" },
        ],
      },
      initialValue: "established",
      description: "New Faces profiles are not expected to have a full gallery/reel — the profile page renders gracefully with only Digitals + Introduction, never as \"broken\".",
    }),
  ],
});
