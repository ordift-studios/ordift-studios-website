import { defineField, defineType } from "sanity";

// Mirrors PulseArticle in types.ts field-for-field — see
// PULSE_ARCHITECTURE.md. One document type covers both news/editorial
// content (contentKind: "article") and deadline-driven listings like
// grants/competitions/casting calls (contentKind: "opportunity"), and
// both Ordift-authored pieces (origin: "editorial") and curated
// third-party content (origin: "curated") — the `hidden` rules below keep
// the Studio form showing only the fields relevant to what's being
// edited, same idea as PortfolioProject's format-conditional fields.
export default defineType({
  name: "pulseArticle",
  title: "Pulse Article",
  type: "document",
  fields: [
    defineField({ name: "title", title: "Title", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title" },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "contentKind",
      title: "Content Kind",
      type: "string",
      options: {
        list: [
          { title: "Article / News", value: "article" },
          { title: "Opportunity / Listing (grant, casting call, festival, etc.)", value: "opportunity" },
        ],
      },
      initialValue: "article",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "origin",
      title: "Origin",
      type: "string",
      options: {
        list: [
          { title: "Editorial (Ordift-authored)", value: "editorial" },
          { title: "Curated (from a trusted source)", value: "curated" },
          { title: "Community Submitted", value: "community" },
        ],
      },
      initialValue: "editorial",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      options: { list: ["draft", "inReview", "published", "archived"] },
      initialValue: "draft",
      validation: (r) => r.required(),
      description: 'Curated or Community Submitted content should always pass through "In Review" before Published — never flip it straight from Draft to Published. Editorial (staff-authored) content may skip In Review if the author is already an approver. "Archived" keeps a past item visible on the public site (dimmed, labeled) rather than removing it — use it for expired opportunities or superseded updates.',
    }),
    defineField({ name: "featured", title: "Featured", type: "boolean", initialValue: false }),
    defineField({ name: "heroMedia", title: "Hero Media", type: "mediaAsset", validation: (r) => r.required() }),
    defineField({
      name: "author",
      title: "Author",
      type: "reference",
      to: [{ type: "author" }],
      hidden: ({ document }) => document?.origin !== "editorial",
      description: "Set only for editorial (Ordift-authored) pieces — reuses the same Author list as Stories.",
    }),
    defineField({
      name: "categories",
      title: "Categories",
      type: "array",
      of: [{ type: "reference", to: [{ type: "pulseCategory" }] }],
    }),
    defineField({
      name: "regions",
      title: "Regions",
      type: "array",
      of: [{ type: "reference", to: [{ type: "pulseRegion" }] }],
    }),
    defineField({
      name: "opportunityTypes",
      title: "Opportunity Types",
      type: "array",
      of: [{ type: "reference", to: [{ type: "pulseOpportunityType" }] }],
      hidden: ({ document }) => document?.contentKind !== "opportunity",
    }),
    defineField({ name: "tags", title: "Tags", type: "array", of: [{ type: "string" }], options: { layout: "tags" } }),
    defineField({ name: "excerpt", title: "Excerpt", type: "text", rows: 3, validation: (r) => r.required() }),
    defineField({
      name: "body",
      title: "Body",
      type: "text",
      rows: 16,
      validation: (r) => r.required(),
      description: "For curated content: a written summary in Ordift's own words, never a raw reproduction of the source article. Link out via Source URL below for the full piece.",
    }),
    defineField({
      name: "source",
      title: "Source",
      type: "reference",
      to: [{ type: "pulseSource" }],
      hidden: ({ document }) => document?.origin !== "curated",
      description: "The registered trusted-source entry — curated content only. Community submissions use Source URL/Attribution below instead, since they aren't necessarily from a registered source.",
    }),
    defineField({
      name: "sourceUrl",
      title: "Source URL",
      type: "url",
      hidden: ({ document }) => document?.origin !== "curated" && document?.origin !== "community",
      description: 'The original article\'s canonical link (or, for a community submission, the link being shared) — always shown as a "read more at the source" link, never hidden.',
    }),
    defineField({
      name: "sourceAttribution",
      title: "Source Attribution",
      type: "string",
      hidden: ({ document }) => document?.origin !== "curated" && document?.origin !== "community",
      description: 'e.g. "via Vogue Business", or "Submitted by @handle" for a community item.',
    }),
    defineField({
      name: "aiSummary",
      title: "AI-Generated Summary (draft input)",
      type: "text",
      rows: 6,
      description: "Scratch space for a future AI-assisted first draft. Never published directly — an editor turns this into (or approves it as) the Body above before Publish.",
    }),
    defineField({
      name: "aiSummaryApprovedAt",
      title: "AI Summary Approved At",
      type: "datetime",
      readOnly: true,
      description: "Set automatically (future) when an admin approves an AI-generated summary as the basis for Body.",
    }),
    defineField({
      name: "applicationDeadline",
      title: "Application Deadline",
      type: "date",
      hidden: ({ document }) => document?.contentKind !== "opportunity",
    }),
    defineField({
      name: "eventStartDate",
      title: "Event Start Date",
      type: "date",
      hidden: ({ document }) => document?.contentKind !== "opportunity",
    }),
    defineField({
      name: "eventEndDate",
      title: "Event End Date",
      type: "date",
      hidden: ({ document }) => document?.contentKind !== "opportunity",
    }),
    defineField({
      name: "location",
      title: "Location",
      type: "string",
      hidden: ({ document }) => document?.contentKind !== "opportunity",
    }),
    defineField({
      name: "applyUrl",
      title: "Apply / More Info URL",
      type: "url",
      hidden: ({ document }) => document?.contentKind !== "opportunity",
    }),
    defineField({
      name: "eligibility",
      title: "Eligibility",
      type: "text",
      rows: 3,
      hidden: ({ document }) => document?.contentKind !== "opportunity",
    }),
    defineField({ name: "publishedAt", title: "Published At", type: "datetime" }),
    defineField({
      name: "scheduledFor",
      title: "Scheduled For",
      type: "datetime",
      description: "Leave blank to publish immediately once Status is Published. Set a future date to schedule — the article stays hidden until then, no separate action needed.",
    }),
    defineField({
      name: "relatedArticles",
      title: "Related Pulse Articles",
      type: "array",
      of: [{ type: "reference", to: [{ type: "pulseArticle" }] }],
    }),
    defineField({
      name: "relatedProjects",
      title: "Related Portfolio Projects",
      type: "array",
      of: [{ type: "reference", to: [{ type: "portfolioProject" }] }],
    }),
    defineField({
      name: "relatedWorkshops",
      title: "Related Workshops",
      type: "array",
      of: [{ type: "reference", to: [{ type: "workshop" }] }],
    }),
    defineField({
      name: "newsletterExcerpt",
      title: "Newsletter Excerpt",
      type: "text",
      rows: 3,
      description: "Data-readiness only — no newsletter-sending integration exists yet.",
    }),
    defineField({ name: "seo", title: "SEO", type: "seo" }),

    // --- Discovery/dedup foundation (Phase A, 2026-08-24) — written by a
    // future ingestion step, never by an editor directly. See
    // PULSE_INGESTION_FOUNDATION.md.
    defineField({
      name: "possibleDuplicateOf",
      title: "Possible Duplicate Of",
      type: "reference",
      to: [{ type: "pulseArticle" }],
      description:
        "For a future dedup step to set when this item closely matches an existing article (same source URL, or a very similar title within the same time window) — schema-only in Phase A, not yet written or enforced by any code. Never auto-deleted — an editor decides whether to publish this one, the other, or both. Actually excluding a flagged item from the public feed is a later-phase query change, not yet made.",
    }),
    defineField({
      name: "relevanceScore",
      title: "Relevance Score",
      type: "number",
      readOnly: true,
      description: "System-calculated (region/topic/freshness/trust/priority) — not manually edited. See Pulse Settings for the configurable weights.",
    }),
    defineField({
      name: "discoveryRunId",
      title: "Discovery Run ID",
      type: "string",
      readOnly: true,
      description: "Ties this draft back to the activity_log entry for the discovery run that created it, if machine-discovered. Blank for manually created articles.",
    }),
  ],
  preview: {
    select: { title: "title", status: "status", origin: "origin" },
    prepare({ title, status, origin }) {
      return { title, subtitle: `${status} · ${origin}` };
    },
  },
});
