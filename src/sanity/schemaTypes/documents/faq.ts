import { defineField, defineType } from "sanity";

// Standalone, reusable FAQ entity (distinct from the FAQ items nested
// directly inside a Workshop) — for general site FAQs, e.g. on About or
// Contact. Not yet wired to a domain type/page; schema-prepared per this
// milestone's scope (see MILESTONES.md).
export default defineType({
  name: "faq",
  title: "FAQ",
  type: "document",
  fields: [
    defineField({ name: "question", title: "Question", type: "string", validation: (r) => r.required() }),
    defineField({ name: "answer", title: "Answer", type: "text", rows: 4, validation: (r) => r.required() }),
    defineField({
      name: "context",
      title: "Context",
      type: "string",
      description: "Where this FAQ is intended to appear (e.g. \"About\", \"Booking\", \"General\").",
    }),
  ],
});
