import { defineField, defineType } from "sanity";

// One curated homepage-slideshow slide (2026-08-23) — a landscape/portrait
// image pair, not a duplicated Portfolio Project. `project` is an optional
// reference for internal attribution/organisation only; the public
// homepage never shows its title/category/discipline — see
// WorkDisciplineBands/PortfolioHeroSlideshow's own "hero" variant for the
// deliberately image-only presentation this feeds. Landscape/portrait are
// each independently optional so an admin can add one orientation now and
// the other later — the frontend fallback chain (see
// src/lib/content/sanity/repository.ts's getHomePage()) handles whichever
// combination exists without ever breaking a slide.
export default defineType({
  name: "homepageSlideshowSlide",
  title: "Homepage Slideshow Slide",
  type: "object",
  fields: [
    defineField({
      name: "project",
      title: "Portfolio Project (optional)",
      type: "reference",
      to: [{ type: "portfolioProject" }],
      description: "For internal attribution/organisation only — never shown publicly, and never required.",
    }),
    defineField({
      name: "landscapeImage",
      title: "Landscape Image",
      type: "image",
      options: { hotspot: true },
      description: "Shown on landscape-oriented viewports (desktop, laptop, landscape tablet, landscape phone).",
    }),
    defineField({
      name: "landscapeAlt",
      title: "Landscape Image Alt Text",
      type: "string",
      hidden: ({ parent }) => !parent?.landscapeImage,
      validation: (r) => r.custom((value, ctx) => {
        const parent = ctx.parent as { landscapeImage?: unknown } | undefined;
        if (parent?.landscapeImage && !value) return "Alt text is required when a landscape image is set.";
        return true;
      }),
    }),
    defineField({
      name: "portraitImage",
      title: "Portrait Image",
      type: "image",
      options: { hotspot: true },
      description: "Shown on portrait-oriented viewports (portrait phone, portrait tablet).",
    }),
    defineField({
      name: "portraitAlt",
      title: "Portrait Image Alt Text",
      type: "string",
      hidden: ({ parent }) => !parent?.portraitImage,
      validation: (r) => r.custom((value, ctx) => {
        const parent = ctx.parent as { portraitImage?: unknown } | undefined;
        if (parent?.portraitImage && !value) return "Alt text is required when a portrait image is set.";
        return true;
      }),
    }),
    defineField({
      name: "enabled",
      title: "Enabled",
      type: "boolean",
      initialValue: true,
      description: "Disabled slides are kept (not deleted) but never shown on the live homepage.",
    }),
  ],
  preview: {
    select: { title: "project.title", landscape: "landscapeImage", portrait: "portraitImage", enabled: "enabled" },
    prepare({ title, landscape, portrait, enabled }) {
      const orientation = landscape && portrait ? "L+P" : landscape ? "Landscape only" : portrait ? "Portrait only" : "No image yet";
      return {
        title: title || "(no linked project)",
        subtitle: `${enabled === false ? "Disabled — " : ""}${orientation}`,
        media: landscape || portrait,
      };
    },
  },
});
