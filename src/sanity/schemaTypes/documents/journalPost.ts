import { defineField, defineType } from "sanity";

// Mirrors JournalPost in types.ts — branded "Stories" on the frontend,
// kept as journalPost here for continuity with the existing route/content
// layer naming. See CMS_MIGRATION.md.
export default defineType({
  name: "journalPost",
  title: "Story",
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
      name: "status",
      title: "Status",
      type: "string",
      options: { list: ["draft", "published"] },
      initialValue: "draft",
      validation: (r) => r.required(),
    }),
    defineField({ name: "featured", title: "Featured", type: "boolean", initialValue: false }),
    defineField({
      name: "format",
      title: "Format",
      type: "string",
      options: { list: ["written", "video"] },
      initialValue: "written",
      validation: (r) => r.required(),
    }),
    defineField({ name: "author", title: "Author", type: "reference", to: [{ type: "author" }], validation: (r) => r.required() }),
    defineField({
      name: "categories",
      title: "Categories",
      type: "array",
      of: [{ type: "reference", to: [{ type: "journalCategory" }] }],
    }),
    defineField({ name: "tags", title: "Tags", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "heroImage", title: "Hero Image", type: "mediaAsset", validation: (r) => r.required() }),
    defineField({ name: "videoUrl", title: "Video URL", type: "url", hidden: ({ document }) => document?.format !== "video" }),
    defineField({ name: "excerpt", title: "Excerpt", type: "text", rows: 3, validation: (r) => r.required() }),
    // Plain text, not Portable Text — matches JournalPost.body: string in
    // types.ts exactly, so the adapter is a straight pass-through and the
    // frontend needs no change. Upgrading to Portable Text (real rich
    // text) is a legitimate future improvement, but it requires a
    // PortableText renderer on the detail page — a frontend change, which
    // this milestone's "don't change the frontend" constraint defers.
    defineField({ name: "body", title: "Body", type: "text", rows: 20, validation: (r) => r.required() }),
    defineField({ name: "publishedAt", title: "Published At", type: "datetime" }),
    defineField({
      name: "scheduledFor",
      title: "Scheduled For",
      type: "datetime",
      description: "Leave blank to publish immediately once Status is Published. Set a future date to schedule — the post stays hidden until then, no separate action needed.",
    }),
    defineField({
      name: "relatedPosts",
      title: "Related Stories",
      type: "array",
      of: [{ type: "reference", to: [{ type: "journalPost" }] }],
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
  preview: { select: { title: "title", subtitle: "status" } },
});
