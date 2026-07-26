import { defineField, defineType } from "sanity";

// Geographic-scope taxonomy axis for Ordift Pulse — e.g. "Ghana",
// "Qatar", "Africa", "International". Independent of Category (a
// Photography News item can be tagged both "Photography" and "Ghana").
// See PULSE_ARCHITECTURE.md §2.
export default defineType({
  name: "pulseRegion",
  title: "Pulse Region",
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
