import { defineField, defineType } from "sanity";

// Prepared for future admin-curated tag suggestions. JournalPost.tags is
// currently a free-text string[] in the domain model (types.ts) and stays
// that way in this milestone — changing it to a reference array would be
// a frontend-affecting change outside this milestone's "don't change the
// frontend" constraint. This document type lets an editor build a
// controlled vocabulary in Sanity now; wiring it as an autocomplete
// source for JournalPost.tags is a follow-up, not a blocker.
export default defineType({
  name: "tag",
  title: "Tag",
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
  ],
});
