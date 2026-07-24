import { defineField, defineType } from "sanity";

export default defineType({
  name: "venue",
  title: "Venue",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "addressLine", title: "Address", type: "string", description: "Leave blank when format is Online." }),
    defineField({
      name: "format",
      title: "Format",
      type: "string",
      options: { list: ["in-person", "online", "hybrid"] },
      validation: (r) => r.required(),
    }),
    defineField({ name: "mapUrl", title: "Map URL", type: "url" }),
  ],
});
