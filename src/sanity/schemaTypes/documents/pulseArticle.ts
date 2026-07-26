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
      description: 'Curated content should always pass through "In Review" before Published — never flip curated content straight from Draft to Published. Editorial (staff-authored) content may skip In Review if the author is already an approver.',
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
    }),
    defineField({
      name: "sourceUrl",
      title: "Source URL",
      type: "url",
      hidden: ({ document }) => document?.origin !== "curated",
      description: 'The original article\'s canonical link — always shown as a "read more at the source" link, never hidden.',
    }),
    defineField({
      name: "sourceAttribution",
      title: "Source Attribution",
      type: "string",
      hidden: ({ document }) => document?.origin !== "curated",
      description: 'e.g. "via Vogue Business"',
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
  ],
  preview: {
    select: { title: "title", status: "status", origin: "origin" },
    prepare({ title, status, origin }) {
      return { title, subtitle: `${status} · ${origin}` };
    },
  },
});
