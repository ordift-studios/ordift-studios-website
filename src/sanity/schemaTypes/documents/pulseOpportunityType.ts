import { defineField, defineType } from "sanity";

// Opportunity/event-type taxonomy axis for Ordift Pulse — e.g.
// "Exhibition", "Fashion Week", "Festival", "Award", "Grant",
// "Competition", "Casting Call", "Collaboration Opportunity". Only
// meaningful on a PulseArticle with contentKind === "opportunity". See
// PULSE_ARCHITECTURE.md §2.
export default defineType({
  name: "pulseOpportunityType",
  title: "Pulse Opportunity Type",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "name" },
      validation: (r) => r.required(),
    }),
    defineField({ name: "description", title: "Description", type: "text", rows: 2 }),
  ],
});
