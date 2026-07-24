import { defineField, defineType } from "sanity";

// Kept separate from portfolioCategory/journalCategory even though the
// shape is identical — the three taxonomies are edited and browsed
// independently. See CMS_MIGRATION.md.
export default defineType({
  name: "workshopCategory",
  title: "Workshop Category",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "name" },
      validation: (r) => r.required(),
    }),
    defineField({ name: "description", title: "Description", type: "text", rows: 2 }),
  ],
});
