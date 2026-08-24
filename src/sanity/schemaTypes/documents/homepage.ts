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
    { name: "slideshow", title: "Homepage Slideshow" },
    { name: "whoWeAre", title: "Who We Are" },
    { name: "aboutPreviewVisuals", title: "About Preview Visuals" },
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

    defineField({
      name: "slideshowSlides",
      title: "Homepage Slideshow Slides",
      type: "array",
      group: "slideshow",
      of: [{ type: "homepageSlideshowSlide" }],
      description:
        "Curated homepage opening slideshow. Reorder by dragging. While this is empty (or has no enabled slides), the homepage automatically falls back to the existing published-Portfolio-project slideshow — the live site is never left without a working slideshow.",
    }),

    defineField({ name: "whoWeAreEyebrow", title: "Eyebrow", type: "string", group: "whoWeAre" }),
    defineField({ name: "whoWeAreBody", title: "Body", type: "text", rows: 4, group: "whoWeAre" }),

    // Homepage About Preview background photography (2026-08-24) —
    // deliberately editable only via Admin -> Portfolio -> Homepage
    // About Visuals (mirrors Work Landing Images/Portfolio Cover Image
    // exactly), not automatically populated from Portfolio content.
    // Optional: the public homepage falls back to a clean solid-color
    // treatment when unset, never a Sample/placeholder image.
    defineField({
      name: "aboutMissionImage",
      title: "Our Mission — Background Image",
      type: "image",
      options: { hotspot: true },
      group: "aboutPreviewVisuals",
      description: "Optional. Managed from Admin -> Portfolio -> Homepage About Visuals, not here directly.",
    }),
    defineField({ name: "aboutMissionImageAlt", title: "Our Mission — Image Alt Text", type: "string", group: "aboutPreviewVisuals" }),
    defineField({
      name: "aboutVisionImage",
      title: "Our Vision — Background Image",
      type: "image",
      options: { hotspot: true },
      group: "aboutPreviewVisuals",
      description: "Optional. Managed from Admin -> Portfolio -> Homepage About Visuals, not here directly.",
    }),
    defineField({ name: "aboutVisionImageAlt", title: "Our Vision — Image Alt Text", type: "string", group: "aboutPreviewVisuals" }),

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
