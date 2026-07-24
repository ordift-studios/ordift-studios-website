import { defineField, defineType } from "sanity";

// Schema only — no landing pages exist in this codebase (Home/About/
// Services/departments each have their own dedicated schema instead).
// This is forward-looking infrastructure for future campaign/marketing
// pages (e.g. a workshop cohort launch, a seasonal promotion) that need a
// one-off page without a matching Next.js route being hand-built each
// time. No document of this type has been created, and nothing in the
// frontend renders it yet — building the render path is deferred until a
// real campaign actually needs one, per the "no feature without a clear
// place" principle: the schema is cheap to have ready, but a generic
// page-rendering route is real engineering not worth doing speculatively.
export default defineType({
  name: "landingPage",
  title: "Landing Page",
  type: "document",
  fields: [
    defineField({ name: "title", title: "Title", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title" },
      validation: (r) => r.required(),
      description: "Would map to /landing/[slug] if this type is ever wired to a render path.",
    }),
    defineField({ name: "heroEyebrow", title: "Hero Eyebrow", type: "string" }),
    defineField({ name: "heroHeadline", title: "Hero Headline", type: "string" }),
    defineField({ name: "heroBody", title: "Hero Body", type: "text", rows: 3 }),
    defineField({ name: "heroMedia", title: "Hero Media", type: "mediaAsset" }),
    defineField({
      name: "sections",
      title: "Content Sections",
      type: "array",
      of: [
        {
          type: "object",
          name: "landingSection",
          fields: [
            defineField({ name: "heading", title: "Heading", type: "string" }),
            defineField({ name: "body", title: "Body", type: "text", rows: 4 }),
          ],
        },
      ],
    }),
    defineField({ name: "cta", title: "Call to Action", type: "ctaButton" }),
    defineField({ name: "isPublished", title: "Published", type: "boolean", initialValue: false }),
    defineField({ name: "seo", title: "SEO", type: "seo" }),
  ],
});
