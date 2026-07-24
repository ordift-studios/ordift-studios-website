import { defineField, defineType } from "sanity";

// Repeatable — one document per department page. Mirrors Service in
// types.ts field-for-field. Holds the real, already-approved department
// copy (migrated 2026-07-24), sourced verbatim from the original brief.
export default defineType({
  name: "service",
  title: "Service / Department",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "name" },
      validation: (r) => r.required(),
      description: "Must match the existing /services/[slug] route (photography, videography, graphic-design, branding, content-creation, talent-management, production).",
    }),
    defineField({ name: "summaryDescription", title: "Summary (hub card)", type: "text", rows: 2 }),
    defineField({ name: "heroEyebrow", title: "Hero Eyebrow", type: "string", initialValue: "Department" }),
    defineField({ name: "heroHeadline", title: "Hero Headline", type: "string" }),
    defineField({ name: "heroBody", title: "Hero Body", type: "text", rows: 3 }),
    defineField({ name: "offeringsHeadline", title: "\"What We Offer\" Headline", type: "string" }),
    defineField({ name: "offerings", title: "Offerings List", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "additionalHeading", title: "Additional Section Heading", type: "string", description: "e.g. Content Creation's \"Who It's For\" — leave blank if not needed." }),
    defineField({ name: "additionalItems", title: "Additional Section Items", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "ctaEyebrow", title: "CTA Eyebrow", type: "string" }),
    defineField({ name: "ctaHeadline", title: "CTA Headline", type: "string" }),
    defineField({ name: "ctaBody", title: "CTA Body", type: "text", rows: 2 }),
    defineField({ name: "ctaPrimaryLabel", title: "CTA Primary Button Label", type: "string" }),
    defineField({ name: "ctaSecondaryLabel", title: "CTA Secondary Button Label", type: "string" }),
    defineField({ name: "isComingSoon", title: "Coming Soon (no live functionality yet)", type: "boolean", initialValue: false }),
    defineField({ name: "displayOrder", title: "Display Order", type: "number" }),
    defineField({ name: "seo", title: "SEO", type: "seo" }),
  ],
  preview: { select: { title: "name" } },
});
