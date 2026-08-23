import { defineField, defineType } from "sanity";

// Mirrors PortfolioProject in types.ts field-for-field — see CMS_MIGRATION.md.
export default defineType({
  name: "portfolioProject",
  title: "Portfolio Project",
  type: "document",
  fields: [
    defineField({ name: "title", title: "Title", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title" },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      options: {
        list: [
          { title: "Draft", value: "draft" },
          { title: "Pending Review", value: "pending_review" },
          { title: "Approved", value: "approved" },
          { title: "Published", value: "published" },
          { title: "Archived", value: "archived" },
        ],
      },
      initialValue: "draft",
      validation: (r) => r.required(),
      description:
        "Portfolio Management System lifecycle (Admin Platform, /admin/portfolio) — moved forward via the Admin Portal's review actions, not usually edited directly here. Only \"published\" is publicly visible (see portfolioProjectsQuery).",
    }),
    defineField({
      name: "scheduledFor",
      title: "Scheduled For",
      type: "datetime",
      description:
        "Optional. When set on a \"published\" project, it stays hidden from the public site until this moment — same scheduled-publishing pattern as Journal/Pulse.",
    }),
    defineField({ name: "featured", title: "Featured", type: "boolean", initialValue: false }),
    defineField({ name: "heroMedia", title: "Hero Media", type: "mediaAsset", validation: (r) => r.required() }),
    defineField({
      name: "coverImage",
      title: "Portfolio Cover / Index Image",
      type: "image",
      options: { hotspot: true },
      description:
        "Admin-chosen image shown for this project on a discipline index page (e.g. /work/photography), instead of the frontend automatically picking one. Managed from Admin → Portfolio, not usually edited here. Optional: when unset, the index page falls back to Hero Media above, same as before this field existed. Does not affect this project's own detail page.",
    }),
    defineField({
      name: "coverImageAlt",
      title: "Portfolio Cover / Index Image Alt Text",
      type: "string",
      hidden: ({ parent }) => !parent?.coverImage,
    }),
    defineField({
      name: "disciplines",
      title: "Disciplines",
      type: "array",
      of: [{ type: "string" }],
      options: {
        list: ["photography", "videography", "graphic-design", "branding", "content-creation", "talent-management", "production"],
      },
    }),
    defineField({
      name: "categories",
      title: "Categories",
      type: "array",
      of: [{ type: "reference", to: [{ type: "portfolioCategory" }] }],
    }),
    defineField({
      name: "collections",
      title: "Collections / Series",
      type: "array",
      of: [{ type: "reference", to: [{ type: "portfolioCollection" }] }],
    }),
    defineField({ name: "seriesOrder", title: "Series Order", type: "number", description: "Position within an ordered Collection/Series; leave blank otherwise." }),
    defineField({ name: "client", title: "Client", type: "string", description: "Optional — only fill in when the client has given permission to be named." }),
    defineField({ name: "year", title: "Year", type: "number" }),
    defineField({ name: "location", title: "Location", type: "string" }),
    defineField({ name: "servicesProvided", title: "Services Provided", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "equipmentUsed", title: "Equipment Used", type: "array", of: [{ type: "string" }] }),
    defineField({
      name: "tags",
      title: "Tags",
      type: "array",
      of: [{ type: "string" }],
      options: { layout: "tags" },
      description: "Freeform tags — e.g. \"outdoor\", \"black-and-white\", \"studio-lit\" — distinct from Disciplines/Categories (structured taxonomy) and Collections/Series (curated grouping).",
    }),
    defineField({
      name: "showCollaborationCredits",
      title: "Show Collaboration / Extended Credits Publicly",
      type: "boolean",
      initialValue: false,
      description:
        "Off by default — ordinary client work stays minimal (no Director/Photographer/Editor/crew shown). Turn on for collaborative projects, workshops, journal/editorial pieces, or productions involving another creative/production house, where the Collaborators list below should actually appear on the public page.",
    }),
    defineField({
      name: "collaborators",
      title: "Collaborators",
      type: "array",
      of: [
        {
          type: "object",
          name: "collaborator",
          fields: [
            defineField({ name: "name", title: "Name", type: "string" }),
            defineField({ name: "role", title: "Role", type: "string", description: "e.g. Photographer, Stylist, Makeup Artist" }),
          ],
        },
      ],
    }),
    defineField({ name: "story", title: "Project Story", type: "text", rows: 6, validation: (r) => r.required() }),
    defineField({ name: "objective", title: "Project Objective", type: "text", rows: 3 }),
    defineField({ name: "strategy", title: "Creative Strategy", type: "text", rows: 3 }),
    defineField({ name: "challenges", title: "Challenges", type: "text", rows: 3 }),
    defineField({ name: "solution", title: "Solution", type: "text", rows: 3 }),
    defineField({ name: "process", title: "Creative Process", type: "text", rows: 3 }),
    defineField({ name: "deliverables", title: "Deliverables", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "results", title: "Results & Impact", type: "text", rows: 3, description: "Optional." }),
    defineField({
      name: "awards",
      title: "Awards",
      type: "array",
      of: [
        {
          type: "object",
          name: "award",
          fields: [
            defineField({ name: "title", title: "Title", type: "string" }),
            defineField({ name: "issuer", title: "Issuer", type: "string" }),
            defineField({ name: "year", title: "Year", type: "number" }),
          ],
        },
      ],
    }),
    defineField({
      name: "publications",
      title: "Publications",
      type: "array",
      of: [
        {
          type: "object",
          name: "publication",
          fields: [
            defineField({ name: "name", title: "Name", type: "string" }),
            defineField({ name: "url", title: "URL", type: "url" }),
            defineField({ name: "year", title: "Year", type: "number" }),
          ],
        },
      ],
    }),
    defineField({ name: "gallery", title: "Final Gallery", type: "array", of: [{ type: "galleryImage" }] }),
    defineField({ name: "behindTheScenesGallery", title: "Behind the Scenes Gallery", type: "array", of: [{ type: "galleryImage" }] }),
    defineField({
      name: "beforeAfterGallery",
      title: "Before & After Gallery",
      type: "array",
      of: [
        {
          type: "object",
          name: "beforeAfterPair",
          fields: [
            defineField({ name: "before", title: "Before", type: "mediaAsset" }),
            defineField({ name: "after", title: "After", type: "mediaAsset" }),
            defineField({ name: "caption", title: "Caption", type: "string" }),
          ],
        },
      ],
    }),
    // "Additional Films" in the Admin Portal / public Videography page —
    // field name kept as "videos" since it already existed and is
    // already wired end-to-end; only its presentation label changed.
    defineField({ name: "videos", title: "Videos (Additional Films)", type: "array", of: [{ type: "mediaAsset" }] }),
    defineField({
      name: "reels",
      title: "Reels / Short Cuts",
      type: "array",
      of: [{ type: "mediaAsset" }],
      description: "Optional short-form/vertical video (Videography). Leave empty if this project has none — the public page only shows a Reels section when at least one exists.",
    }),
    defineField({
      name: "downloadableAssets",
      title: "Downloadable Assets",
      type: "array",
      of: [
        {
          type: "object",
          name: "downloadableAsset",
          fields: [
            defineField({ name: "label", title: "Label", type: "string" }),
            defineField({ name: "file", title: "File", type: "file" }),
            defineField({ name: "fileType", title: "File Type", type: "string", description: "e.g. PDF, ZIP, Press Kit" }),
          ],
        },
      ],
    }),
    defineField({
      name: "testimonials",
      title: "Testimonials",
      type: "array",
      of: [{ type: "reference", to: [{ type: "testimonial" }] }],
    }),
    defineField({
      name: "relatedProjects",
      title: "Related Projects",
      type: "array",
      of: [{ type: "reference", to: [{ type: "portfolioProject" }] }],
    }),
    defineField({
      name: "relatedWorkshops",
      title: "Related Workshops",
      type: "array",
      of: [{ type: "reference", to: [{ type: "workshop" }] }],
    }),
    defineField({
      name: "isPasswordProtected",
      title: "Client Access Only",
      type: "boolean",
      initialValue: false,
      description: "Metadata only — no enforcement exists until authentication is built (ARCHITECTURE.md §4.3).",
    }),
    defineField({ name: "seo", title: "SEO", type: "seo" }),
  ],
  preview: { select: { title: "title", subtitle: "status" } },
});
