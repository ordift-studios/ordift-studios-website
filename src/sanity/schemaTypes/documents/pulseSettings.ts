import { defineField, defineType } from "sanity";

// Singleton (added to SINGLETON_TYPES in schemaTypes/index.ts, same
// mechanism as homepage/aboutPage/etc — see sanity.config.ts). Global
// operational controls for Ordift Pulse discovery/publishing, built ahead
// of the ingestion pipeline itself (Phase A, 2026-08-24 — see
// PULSE_INGESTION_FOUNDATION.md) so the pipeline has somewhere real to
// read its configuration from once it exists. Nothing reads this
// document yet; every switch below defaults to the conservative/off
// position per explicit direction, and no code path currently acts on
// any of these values.
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
      description: "Master switch for automated discovery. OFF until Phase B/C ingestion actually exists and has been reviewed on Staging.",
    }),
    defineField({
      name: "globalAutoPublishEnabled",
      title: "Global Auto-Publish",
      type: "boolean",
      group: "controls",
      initialValue: false,
      description:
        "OFF by default, and must stay OFF for the first live period per explicit direction — every discovered item requires human review regardless of source classification until this is deliberately switched on. Even when on, a source must individually be Green + Auto-Publish Eligible to bypass review.",
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
