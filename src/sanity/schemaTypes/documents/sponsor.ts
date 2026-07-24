import { defineField, defineType } from "sanity";

export default defineType({
  name: "sponsor",
  title: "Sponsor",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "logo", title: "Logo", type: "image" }),
    defineField({ name: "url", title: "URL", type: "url" }),
    defineField({ name: "isPlaceholder", title: "Placeholder", type: "boolean", initialValue: true }),
  ],
});
