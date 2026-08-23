import { defineField, defineType } from "sanity";

// Mirrors MediaAsset in types.ts. "embed" = YouTube/Vimeo/etc — url is the
// embeddable link; "video" = an uploaded file.
export default defineType({
  name: "mediaAsset",
  title: "Media",
  type: "object",
  fields: [
    defineField({
      name: "type",
      title: "Type",
      type: "string",
      options: { list: ["image", "video", "embed"] },
      validation: (r) => r.required(),
    }),
    defineField({ name: "image", title: "Image", type: "image", options: { hotspot: true }, hidden: ({ parent }) => parent?.type !== "image" }),
    defineField({ name: "file", title: "Video File", type: "file", hidden: ({ parent }) => parent?.type !== "video" }),
    defineField({ name: "url", title: "Embed URL", type: "url", hidden: ({ parent }) => parent?.type !== "embed" }),
    defineField({ name: "alt", title: "Alt Text", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "poster",
      title: "Poster / Cover Image",
      type: "image",
      options: { hotspot: true },
      hidden: ({ parent }) => parent?.type === "image",
      description:
        "Shown before playback instead of the video's first frame (which is often black/blank). Optional — for a project's own Main Film, prefer the project's Portfolio Cover Image instead, which already exists for this purpose; this field is for individual Additional Films/Reels within a project, which each need their own poster.",
    }),
    defineField({
      name: "posterAlt",
      title: "Poster Alt Text",
      type: "string",
      hidden: ({ parent }) => parent?.type === "image" || !parent?.poster,
    }),
  ],
});
