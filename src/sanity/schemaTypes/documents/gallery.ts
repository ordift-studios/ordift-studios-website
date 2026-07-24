import { defineField, defineType } from "sanity";

// Standalone, named, reusable image collection — distinct from the
// inline Final/BTS galleries already embedded directly in a
// PortfolioProject or Workshop. Not yet wired to a page; schema-prepared.
export default defineType({
  name: "gallery",
  title: "Gallery",
  type: "document",
  fields: [
    defineField({ name: "title", title: "Title", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title" },
      validation: (r) => r.required(),
    }),
    defineField({ name: "images", title: "Images", type: "array", of: [{ type: "galleryImage" }] }),
  ],
});
