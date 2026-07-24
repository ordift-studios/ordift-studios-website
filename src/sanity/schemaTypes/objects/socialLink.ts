import { defineField, defineType } from "sanity";

export default defineType({
  name: "socialLink",
  title: "Social Link",
  type: "object",
  fields: [
    defineField({
      name: "platform",
      title: "Platform",
      type: "string",
      options: {
        list: ["instagram", "tiktok", "youtube", "linkedin", "facebook", "x", "whatsapp"],
      },
    }),
    defineField({ name: "url", title: "URL", type: "url" }),
  ],
  preview: { select: { title: "platform", subtitle: "url" } },
});
