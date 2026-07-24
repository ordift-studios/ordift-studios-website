import { defineField, defineType } from "sanity";

// A "clients we've worked with" showcase entity — distinct from
// PortfolioProject.client, which is per-project and often left blank
// (client permission required to name them at all).
export default defineType({
  name: "client",
  title: "Client",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "logo", title: "Logo", type: "image" }),
    defineField({ name: "url", title: "URL", type: "url" }),
  ],
});
