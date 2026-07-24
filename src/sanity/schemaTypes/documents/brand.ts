import { defineField, defineType } from "sanity";

// Brand collaborators/logos (e.g. product or fashion brands featured in
// commercial work) — distinct from Clients and Partners; kept separate
// since brand-collaboration display often has different placement/rules
// (e.g. a "as seen with" strip) than a client roster.
export default defineType({
  name: "brand",
  title: "Brand",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "logo", title: "Logo", type: "image" }),
    defineField({ name: "url", title: "URL", type: "url" }),
  ],
});
