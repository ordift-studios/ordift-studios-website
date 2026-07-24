import { defineField, defineType } from "sanity";

// Singleton. Deliberately consolidates "Website Settings", "Contact
// Information", "Social Links", and "Global SEO" into one document —
// these are near-universally a single settings object in practice, and
// splitting them into four separate singletons would just mean four
// desk-structure entries an editor has to know to check instead of one.
// Mirrors src/lib/siteSettings.ts (CONTACT_EMAIL, WhatsApp number).
export default defineType({
  name: "siteSettings",
  title: "Website Settings",
  type: "document",
  fields: [
    defineField({ name: "siteName", title: "Site Name", type: "string", initialValue: "Ordift Studios" }),
    defineField({ name: "tagline", title: "Tagline", type: "string" }),
    defineField({ name: "logo", title: "Logo", type: "image" }),
    defineField({ name: "contactEmail", title: "Contact Email", type: "string" }),
    defineField({ name: "whatsappNumber", title: "WhatsApp Number", type: "string", description: "Digits only, international format." }),
    defineField({ name: "socialLinks", title: "Social Links", type: "array", of: [{ type: "socialLink" }] }),
    defineField({ name: "defaultSeo", title: "Default SEO", type: "seo" }),
  ],
});
