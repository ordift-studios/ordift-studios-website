import { defineField, defineType } from "sanity";

// Singleton — intended to have exactly one document, pinned in the Studio
// desk structure (see sanity.config.ts). Mirrors the LINKS array
// currently hardcoded in src/components/NavBar.tsx.
export default defineType({
  name: "navigation",
  title: "Navigation",
  type: "document",
  fields: [
    defineField({
      name: "links",
      title: "Nav Links",
      type: "array",
      of: [
        {
          type: "object",
          name: "navLink",
          fields: [
            defineField({ name: "label", title: "Label", type: "string" }),
            defineField({ name: "href", title: "Link", type: "string" }),
          ],
        },
      ],
    }),
    defineField({ name: "primaryCta", title: "Primary Button", type: "ctaButton" }),
  ],
});
