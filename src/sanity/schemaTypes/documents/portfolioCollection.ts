import { defineField, defineType } from "sanity";

// Covers both Collections (unordered) and Project Series (ordered, via
// isOrdered) — see Collection's doc comment in types.ts.
export default defineType({
  name: "portfolioCollection",
  title: "Portfolio Collection / Series",
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
    defineField({
      name: "isOrdered",
      title: "Ordered (Series)",
      type: "boolean",
      initialValue: false,
      description: "When true, projects in this collection are ordered by their Series Order field.",
    }),
  ],
});
