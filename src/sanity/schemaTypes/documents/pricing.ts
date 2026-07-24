import { defineField, defineType } from "sanity";

// Schema only — no pricing content exists anywhere in this codebase and
// none is entered here. Per the standing zero-invention/pricing-gating
// rule (already applied to the enquiry form's budget ranges and workshop
// payment flow), no price is shown publicly until real pricing is
// approved. This type exists so that approval, whenever it happens, is a
// content-entry task rather than a schema-design one. `isPublished`
// defaults false and nothing reads this type yet.
export default defineType({
  name: "pricingPackage",
  title: "Pricing Package",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Package Name", type: "string" }),
    defineField({ name: "service", title: "Related Service", type: "reference", to: [{ type: "service" }] }),
    defineField({ name: "description", title: "Description", type: "text", rows: 3 }),
    defineField({ name: "inclusions", title: "What's Included", type: "array", of: [{ type: "string" }] }),
    defineField({
      name: "priceDisplay",
      title: "Price (display text)",
      type: "string",
      description: "Free text (e.g. \"From GHS 2,500\" or \"Contact for quote\") — deliberately not a number field, since no pricing model has been approved yet.",
    }),
    defineField({
      name: "isPublished",
      title: "Published",
      type: "boolean",
      initialValue: false,
      description: "Must stay false until real pricing is reviewed and approved — no page reads this type yet regardless.",
    }),
  ],
});
