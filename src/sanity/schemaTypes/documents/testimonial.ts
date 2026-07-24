import { defineField, defineType } from "sanity";

// Shared pool — referenced from either a Workshop or a PortfolioProject,
// same "no owner" design as Testimonial in types.ts.
export default defineType({
  name: "testimonial",
  title: "Testimonial",
  type: "document",
  fields: [
    defineField({ name: "quote", title: "Quote", type: "text", rows: 3, validation: (r) => r.required() }),
    defineField({ name: "authorName", title: "Author Name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "authorRole", title: "Author Role", type: "string" }),
    defineField({
      name: "isPlaceholder",
      title: "Placeholder (not a real testimonial)",
      type: "boolean",
      initialValue: true,
      description: "Must stay true until a real, permitted testimonial replaces it — the frontend visibly labels placeholder testimonials.",
    }),
  ],
});
