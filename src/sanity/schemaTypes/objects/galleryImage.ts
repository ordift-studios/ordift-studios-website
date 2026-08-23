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
    defineField({
      name: "presentation",
      title: "Presentation (Photography gallery)",
      type: "string",
      options: {
        list: [
          { title: "Automatic (default)", value: "automatic" },
          { title: "Featured / Full Bleed", value: "featured" },
          { title: "Wide", value: "wide" },
          { title: "Portrait Pair candidate", value: "portrait-pair" },
          { title: "Standard", value: "standard" },
        ],
        layout: "radio",
      },
      description:
        "Optional hint for the Photography project gallery's adaptive justified layout. Leave as Automatic for the layout to decide — most images should stay Automatic. Only affects Photography's own gallery presentation; unused by every other discipline.",
    }),
    defineField({
      name: "assetRole",
      title: "Role (Graphic Design case study)",
      type: "string",
      options: {
        list: [
          { title: "Automatic — Selected Work (default)", value: "automatic" },
          { title: "Primary Logo", value: "logo" },
          { title: "Secondary Mark", value: "secondary-mark" },
          { title: "Colour Palette", value: "color-palette" },
          { title: "Typography", value: "typography" },
          { title: "Visual Element", value: "visual-element" },
          { title: "Application / Mockup", value: "application" },
        ],
      },
      description:
        "Optional — routes this image into the Graphic Design project page's Identity/System breakdown or Applications/Mockups section instead of the general Selected Work gallery. Leave as Automatic for anything that's just part of the general showcase. Only affects Graphic Design's own case study page; unused by every other discipline.",
    }),
  ],
});
