import { defineField, defineType } from "sanity";

// Standalone certificate template entity — distinct from the simple
// {offered, description} CertificateInfo already embedded per-workshop.
// Represents a reusable certificate design an admin can attach to
// multiple workshops later. Not yet wired to a page; schema-prepared.
export default defineType({
  name: "certificate",
  title: "Certificate Template",
  type: "document",
  fields: [
    defineField({ name: "title", title: "Title", type: "string", validation: (r) => r.required() }),
    defineField({ name: "description", title: "Description", type: "text", rows: 3 }),
    defineField({ name: "issuingBody", title: "Issuing Body", type: "string", initialValue: "Ordift Studios" }),
    defineField({ name: "templateImage", title: "Template Image", type: "image" }),
  ],
});
