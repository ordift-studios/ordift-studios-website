import { defineField, defineType } from "sanity";

// Ordift Talent — TALENT-SYS-2B, Phase 1 (2026-09-08). Mirrors
// galleryImage.ts's own fields (image/caption/alt/presentation) so the
// Talent Portfolio gallery reuses the exact same "emphasis" concept
// the Photography gallery already has, plus the credit fields Part 9
// of the design brief asks for that galleryImage doesn't carry — kept
// as a separate object rather than adding fields to the shared
// galleryImage type, so this file never risks the Photography/Graphic
// Design galleries it's used by today.
export default defineType({
  name: "talentGalleryImage",
  title: "Talent Gallery Image",
  type: "object",
  fields: [
    defineField({ name: "image", title: "Image", type: "image", options: { hotspot: true }, validation: (r) => r.required() }),
    defineField({ name: "caption", title: "Caption", type: "string" }),
    defineField({ name: "alt", title: "Alt Text", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "presentation",
      title: "Presentation",
      type: "string",
      options: {
        list: [
          { title: "Automatic (default)", value: "automatic" },
          { title: "Featured / Full Bleed", value: "featured" },
          { title: "Wide", value: "wide" },
          { title: "Standard", value: "standard" },
        ],
        layout: "radio",
      },
      description: "Optional hint for the profile's justified gallery layout. Leave as Automatic for the layout to decide.",
    }),
    defineField({ name: "photographerCredit", title: "Photographer / Creative Credit", type: "string" }),
    defineField({ name: "projectCredit", title: "Publication / Client / Project Credit", type: "string", description: "Only fill in when the client/publication has given permission to be named." }),
    defineField({ name: "displayOrder", title: "Display Order", type: "number", description: "Lower numbers appear first. Leave blank to fall back to upload order." }),
  ],
});
