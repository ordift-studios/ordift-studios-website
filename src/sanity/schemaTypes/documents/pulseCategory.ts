import { defineField, defineType } from "sanity";

// Topical taxonomy axis for Ordift Pulse — e.g. "Fashion News",
// "Photography News", "Camera & Equipment", "Creative Technology". One of
// three independent Pulse axes (category/region/opportunity type); see
// PULSE_ARCHITECTURE.md §2.
export default defineType({
  name: "pulseCategory",
  title: "Pulse Category",
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
