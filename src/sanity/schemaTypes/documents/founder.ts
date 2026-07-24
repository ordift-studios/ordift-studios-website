import { defineField, defineType } from "sanity";

// Singleton. Mirrors Founder in types.ts. Kept separate from teamMember —
// per the approved brand decision, this content exists for future use
// even though current About copy foregrounds the team over any one
// individual. Holds the real, approved founder bio (Brand Bible section 8).
export default defineType({
  name: "founder",
  title: "Founder",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string" }),
    defineField({ name: "jobTitle", title: "Title", type: "string", initialValue: "Founder & Creative Director" }),
    defineField({ name: "photo", title: "Photo", type: "image", options: { hotspot: true } }),
    defineField({
      name: "bio",
      title: "Bio (one paragraph per entry)",
      type: "array",
      of: [{ type: "text", rows: 3 }],
    }),
  ],
});
