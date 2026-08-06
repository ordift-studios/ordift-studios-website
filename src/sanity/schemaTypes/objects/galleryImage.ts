import { defineField, defineType } from "sanity";

export default defineType({
  name: "galleryImage",
  title: "Gallery Image",
  type: "object",
  fields: [
    defineField({ name: "image", title: "Image", type: "image", options: { hotspot: true }, validation: (r) => r.required() }),
    defineField({ name: "caption", title: "Caption", type: "string" }),
    defineField({ name: "alt", title: "Alt Text", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "productionNotes",
      title: "Production Notes (internal only)",
      type: "text",
      rows: 3,
      description:
        "Internal review context only — never shown on the public site or indexed by search engines. Use it for technical/creative reasoning, client direction, why this image was selected, or usage/licensing caveats.",
    }),
  ],
});
