import { defineField, defineType } from "sanity";

export default defineType({
  name: "ctaButton",
  title: "Call to Action",
  type: "object",
  fields: [
    defineField({ name: "label", title: "Label", type: "string" }),
    defineField({ name: "href", title: "Link", type: "string", description: "Internal path (e.g. /book) or full URL." }),
  ],
});
