import { defineField, defineType } from "sanity";

// Mirrors src/lib/content/types.ts SeoFields — kept field-for-field
// identical so the Sanity adapter's mapping in
// src/lib/content/sanity/repository.ts is a straight pass-through.
export default defineType({
  name: "seo",
  title: "SEO",
  type: "object",
  fields: [
    defineField({ name: "metaTitle", title: "Meta Title", type: "string" }),
    defineField({ name: "metaDescription", title: "Meta Description", type: "text", rows: 3 }),
    defineField({ name: "ogImage", title: "Social Share Image", type: "image" }),
    defineField({ name: "canonicalUrl", title: "Canonical URL", type: "url" }),
  ],
});
