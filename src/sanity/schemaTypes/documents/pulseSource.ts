import { defineField, defineType } from "sanity";

// The trusted-source registry for Ordift Pulse — where curated content is
// allowed to come from. No fetching/ingestion logic exists yet (see
// PULSE_ARCHITECTURE.md §3); this is purely the admin-managed allowlist a
// future ingestion step would read from and attribute against. Adding a
// source here does not itself pull in any content — every PulseArticle is
// still created (or approved) individually.
export default defineType({
  name: "pulseSource",
  title: "Pulse Source",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "sourceType",
      title: "Source Type",
      type: "string",
      options: {
        list: [
          { title: "RSS Feed", value: "rss" },
          { title: "API", value: "api" },
          { title: "Press Release", value: "press-release" },
          { title: "Partner (direct relationship)", value: "partner" },
          { title: "Manual (editor-submitted)", value: "manual" },
        ],
      },
      initialValue: "manual",
      validation: (r) => r.required(),
    }),
    defineField({ name: "url", title: "URL", type: "url" }),
    defineField({
      name: "licenseNotes",
      title: "License / Usage Notes",
      type: "text",
      rows: 3,
      description: "Usage-rights or attribution terms agreed with this source, if any.",
    }),
    defineField({ name: "isActive", title: "Active", type: "boolean", initialValue: true }),
  ],
  preview: { select: { title: "name", subtitle: "sourceType" } },
});
