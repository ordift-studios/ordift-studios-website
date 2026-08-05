import { defineField, defineType } from "sanity";

// Singleton. Mirrors HomePage in types.ts field-for-field. Holds the
// real, already-approved homepage copy (migrated 2026-07-24) — not
// placeholder content.
export default defineType({
  name: "homepage",
  title: "Homepage",
  type: "document",
  groups: [
    { name: "hero", title: "Hero" },
    { name: "whoWeAre", title: "Who We Are" },
    { name: "originals", title: "Ordift Originals" },
    { name: "process", title: "Process" },
    { name: "cta", title: "Closing CTA" },
    { name: "seo", title: "SEO" },
  ],
  fields: [
    defineField({ name: "heroEyebrow", title: "Eyebrow", type: "string", group: "hero" }),
    defineField({ name: "heroHeadline", title: "Headline", type: "string", group: "hero" }),
    defineField({ name: "heroSubheadline", title: "Subheadline", type: "text", rows: 2, group: "hero" }),
    defineField({ name: "heroPrimaryCta", title: "Primary Button", type: "ctaButton", group: "hero" }),
    defineField({ name: "heroSecondaryCta", title: "Secondary Button", type: "ctaButton", group: "hero" }),
    defineField({
      name: "heroImage",
      title: "Hero Image",
      type: "mediaAsset",
      group: "hero",
      description:
        "Signature campaign visual shown beside the hero headline. Optional — the branded placeholder shows until this is set.",
    }),

    defineField({ name: "whoWeAreEyebrow", title: "Eyebrow", type: "string", group: "whoWeAre" }),
    defineField({ name: "whoWeAreBody", title: "Body", type: "text", rows: 4, group: "whoWeAre" }),

    defineField({ name: "originalsEyebrow", title: "Eyebrow", type: "string", group: "originals" }),
    defineField({ name: "originalsHeadline", title: "Headline", type: "string", group: "originals" }),
    defineField({ name: "originalsBody", title: "Body", type: "text", rows: 3, group: "originals" }),

    defineField({
      name: "process",
      title: "Process Steps",
      type: "array",
      group: "process",
      of: [
        {
          type: "object",
          name: "processStep",
          fields: [
            defineField({ name: "step", title: "Step Name", type: "string" }),
            defineField({ name: "copy", title: "Description", type: "text", rows: 2 }),
          ],
        },
      ],
    }),

    defineField({ name: "ctaHeadline", title: "Headline", type: "string", group: "cta" }),
    defineField({ name: "ctaBody", title: "Body", type: "text", rows: 2, group: "cta" }),
    defineField({ name: "ctaPrimary", title: "Primary Button", type: "ctaButton", group: "cta" }),
    defineField({ name: "ctaSecondary", title: "Secondary Button", type: "ctaButton", group: "cta" }),

    defineField({ name: "seo", title: "SEO", type: "seo", group: "seo" }),
  ],
});
