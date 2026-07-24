import { defineField, defineType } from "sanity";

// Business/strategic partners (e.g. venues, equipment suppliers, other
// studios) — distinct from Clients (who commissioned work) and Sponsors
// (who backed a specific workshop).
export default defineType({
  name: "partner",
  title: "Partner",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "logo", title: "Logo", type: "image" }),
    defineField({ name: "url", title: "URL", type: "url" }),
    defineField({ name: "description", title: "Description", type: "text", rows: 2 }),
  ],
});
