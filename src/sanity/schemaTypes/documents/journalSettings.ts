import { defineField, defineType } from "sanity";

// Singleton (see SINGLETON_TYPES/sanity.config.ts) — Phase E, 2026-08-24.
// One field: an admin-picked Lead Story for the redesigned /journal
// hero. Deliberately a manual pick, never auto-computed by recency —
// same "admin-controlled-only, no fabricated selection" principle
// already established for Homepage About Visuals — so a quiet week
// never surfaces a weak auto-picked lead. Left unset by default; the
// public page simply omits the Lead Story band when this is empty
// rather than falling back to guessing one.
export default defineType({
  name: "journalSettings",
  title: "Journal Settings",
  type: "document",
  fields: [
    defineField({
      name: "leadStory",
      title: "Lead Story",
      type: "reference",
      to: [{ type: "journalPost" }, { type: "pulseArticle" }],
      description: "The single story shown in the Journal's lead hero band. Must already be published. Leave empty to hide the band entirely — never auto-selected.",
    }),
  ],
  preview: {
    select: { title: "leadStory.title" },
    prepare({ title }) {
      return { title: "Journal Settings", subtitle: title ? `Lead: ${title}` : "No Lead Story set" };
    },
  },
});
