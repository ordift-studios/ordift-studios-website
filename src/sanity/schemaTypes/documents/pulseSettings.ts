import { defineField, defineType } from "sanity";

// Singleton (added to SINGLETON_TYPES in schemaTypes/index.ts, same
// mechanism as homepage/aboutPage/etc — see sanity.config.ts). Global
// operational controls for Ordift Pulse discovery/publishing (Phase A,
// 2026-08-24 — see PULSE_INGESTION_FOUNDATION.md).
//
// ACTIVE — genuinely read and enforced by src/lib/pulse/ingestion.ts's
// discovery orchestrator: discoveryEnabled (checked before any external
// fetch — a manual discovery run refuses to proceed while this is off)
// and the five relevance weights (regionWeight/topicWeight/
// freshnessWeight/trustWeight/priorityWeight).
//
// RESERVED/INACTIVE — exist on this document, but no code path reads
// them yet: globalAutoPublishEnabled, maxPostsPerDay,
// minimumRelevanceScore. The orchestrator always creates a discovered
// item with status: "draft" unconditionally, so none of the three could
// currently affect what gets published even if switched on — see each
// field's own description below. Every switch still defaults to the
// conservative/off position per explicit direction.
export default defineType({
  name: "pulseSettings",
  title: "Pulse Settings",
  type: "document",
  groups: [
    { name: "controls", title: "Discovery Controls" },
    { name: "weights", title: "Relevance Weights" },
  ],
  fields: [
    defineField({
      name: "discoveryEnabled",
      title: "Creative Radar Discovery",
      type: "boolean",
      group: "controls",
      initialValue: false,
      description:
        "ACTIVE — the real master switch for manual discovery runs. While OFF, an Admin/Super Admin-triggered discovery run stops safely before any external fetch, for every source, regardless of that source's own settings. Turn ON only once discovery is ready to actually run.",
    }),
    defineField({
      name: "globalAutoPublishEnabled",
      title: "Global Auto-Publish",
      type: "boolean",
      group: "controls",
      initialValue: false,
      description:
        "RESERVED / NOT YET FUNCTIONAL — no code currently reads this field. Every discovered item requires human review today regardless of this setting or any source's classification; switching this ON right now has no effect. Reserved for a future, explicitly approved auto-publication phase, at which point the intent is: even when on, a source must individually be Green + Auto-Publish Eligible to bypass review.",
    }),
    defineField({
      name: "maxPostsPerDay",
      title: "Maximum Posts Per Day",
      type: "number",
      group: "controls",
      initialValue: 5,
      description: "Ceiling on how many Creative Radar items may publish per day, once auto-publish is ever enabled.",
    }),
    defineField({
      name: "minimumRelevanceScore",
      title: "Minimum Relevance Score",
      type: "number",
      group: "controls",
      initialValue: 50,
      description: "0–100 scale. Items scoring below this are still saved as drafts for review, never auto-discarded.",
    }),
    defineField({
      name: "regionWeight",
      title: "Region Relevance Weight",
      type: "number",
      group: "weights",
      initialValue: 20,
    }),
    defineField({
      name: "topicWeight",
      title: "Topic Relevance Weight",
      type: "number",
      group: "weights",
      initialValue: 30,
    }),
    defineField({
      name: "freshnessWeight",
      title: "Freshness Weight",
      type: "number",
      group: "weights",
      initialValue: 20,
    }),
    defineField({
      name: "trustWeight",
      title: "Source Trust Weight",
      type: "number",
      group: "weights",
      initialValue: 20,
    }),
    defineField({
      name: "priorityWeight",
      title: "Editorial Priority Weight",
      type: "number",
      group: "weights",
      initialValue: 10,
      description: "The five weights above are a configurable convention, not a hard constraint — they read most naturally summing to roughly 100, but nothing enforces that.",
    }),
  ],
  preview: {
    prepare() {
      return { title: "Pulse Settings" };
    },
  },
});
