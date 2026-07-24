import { defineField, defineType } from "sanity";

// Repeatable — Privacy Notice, Cookie Notice, Website Terms, Booking
// Terms. Structure/routes already exist at /legal/*; per the standing
// legal-gating rule, content here is unpublished/noindexed until
// approved and LEGAL_PAGES_APPROVED=true (see src/lib/shared/env.ts).
export default defineType({
  name: "legalPage",
  title: "Legal Page",
  type: "document",
  fields: [
    defineField({ name: "title", title: "Title", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title" },
      validation: (r) => r.required(),
      description: "Should match the existing /legal/[slug] route (privacy, cookies, terms, booking).",
    }),
    defineField({ name: "body", title: "Body", type: "text", rows: 20 }),
    defineField({ name: "isApproved", title: "Approved for Production", type: "boolean", initialValue: false }),
    defineField({ name: "lastUpdated", title: "Last Updated", type: "date" }),
  ],
});
