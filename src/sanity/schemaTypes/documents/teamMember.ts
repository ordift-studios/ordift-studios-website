import { defineField, defineType } from "sanity";

// Per the approved brand decision (About milestone): Ordift Studios is
// founder-led and works with selected creative professionals per
// project — no unnamed/placeholder team profiles are published. This
// stays genuinely empty until real, approved profiles exist.
export default defineType({
  name: "teamMember",
  title: "Team Member",
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
    defineField({ name: "jobTitle", title: "Title", type: "string" }),
    defineField({ name: "bio", title: "Bio", type: "text", rows: 4 }),
    defineField({ name: "photo", title: "Photo", type: "image", options: { hotspot: true } }),
  ],
});
