import { defineField, defineType } from "sanity";

// Singleton. Mirrors the COLUMNS/LEGAL_LINKS structure currently
// hardcoded in src/components/Footer.tsx.
export default defineType({
  name: "footerSettings",
  title: "Footer",
  type: "document",
  fields: [
    defineField({ name: "tagline", title: "Tagline", type: "text", rows: 2 }),
    defineField({
      name: "columns",
      title: "Link Columns",
      type: "array",
      of: [
        {
          type: "object",
          name: "footerColumn",
          fields: [
            defineField({ name: "heading", title: "Heading", type: "string" }),
            defineField({
              name: "links",
              title: "Links",
              type: "array",
              of: [
                {
                  type: "object",
                  name: "footerLink",
                  fields: [
                    defineField({ name: "label", title: "Label", type: "string" }),
                    defineField({ name: "href", title: "Link", type: "string" }),
                  ],
                },
              ],
            }),
          ],
        },
      ],
    }),
  ],
});
