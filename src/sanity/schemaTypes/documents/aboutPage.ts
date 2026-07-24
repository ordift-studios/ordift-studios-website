import { defineField, defineType } from "sanity";

// Singleton. Mirrors AboutPage in types.ts field-for-field. Holds the
// real, already-approved About copy (migrated 2026-07-24), sourced from
// the Brand Bible per the comment previously in src/app/about/page.tsx.
export default defineType({
  name: "aboutPage",
  title: "About Page",
  type: "document",
  groups: [
    { name: "hero", title: "Hero" },
    { name: "story", title: "Story" },
    { name: "missionVision", title: "Mission & Vision" },
    { name: "values", title: "Values" },
    { name: "team", title: "Team" },
    { name: "cta", title: "Closing CTA" },
    { name: "seo", title: "SEO" },
  ],
  fields: [
    defineField({ name: "heroEyebrow", title: "Eyebrow", type: "string", group: "hero" }),
    defineField({ name: "heroHeadline", title: "Headline", type: "string", group: "hero" }),

    defineField({ name: "storyEyebrow", title: "Eyebrow", type: "string", group: "story" }),
    defineField({ name: "storyHeadline", title: "Headline", type: "string", group: "story" }),
    defineField({
      name: "storyBody",
      title: "Body (one paragraph per entry)",
      type: "array",
      of: [{ type: "text", rows: 3 }],
      group: "story",
    }),

    defineField({ name: "mission", title: "Mission", type: "text", rows: 3, group: "missionVision" }),
    defineField({ name: "vision", title: "Vision", type: "text", rows: 3, group: "missionVision" }),

    defineField({
      name: "values",
      title: "Values",
      type: "array",
      group: "values",
      of: [
        {
          type: "object",
          name: "value",
          fields: [
            defineField({ name: "name", title: "Name", type: "string" }),
            defineField({ name: "copy", title: "Description", type: "text", rows: 2 }),
          ],
        },
      ],
    }),

    defineField({ name: "teamEyebrow", title: "Eyebrow", type: "string", group: "team" }),
    defineField({ name: "teamHeadline", title: "Headline", type: "string", group: "team" }),
    defineField({
      name: "teamBody",
      title: "Body (one paragraph per entry)",
      type: "array",
      of: [{ type: "text", rows: 3 }],
      group: "team",
    }),

    defineField({ name: "ctaHeadline", title: "Headline", type: "string", group: "cta" }),
    defineField({ name: "ctaBody", title: "Body", type: "text", rows: 2, group: "cta" }),

    defineField({ name: "seo", title: "SEO", type: "seo", group: "seo" }),
  ],
});
