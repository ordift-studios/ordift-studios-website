import { defineField, defineType } from "sanity";

// The trusted-source registry for Ordift Pulse — where curated content is
// allowed to come from. No fetching/ingestion logic exists yet (Phase A,
// 2026-08-24 — see PULSE_INGESTION_FOUNDATION.md); this is purely the
// admin-managed allowlist a future ingestion step would read from and
// attribute against. Adding a source here does not itself pull in any
// content — every PulseArticle is still created (or approved) individually.
//
// Two independent classifications, deliberately never collapsed into one
// field (explicit direction, 2026-08-24): `permissionClassification` is a
// LEGAL/LICENSING fact (may Ordift use this source's material the way it
// intends to?), while `editorialTrustLevel` is a QUALITY/REPUTATION fact
// (is this source's own journalism/curation reliable?). A highly reputable
// publication can still be Amber/Blue legally; a legally reusable feed can
// still be editorially weak. Neither implies the other.
export default defineType({
  name: "pulseSource",
  title: "Pulse Source",
  type: "document",
  groups: [
    { name: "basics", title: "Basics" },
    { name: "access", title: "Access" },
    { name: "permission", title: "Permission & Licensing" },
    { name: "editorial", title: "Editorial" },
    { name: "autoPublish", title: "Auto-Publish" },
  ],
  fields: [
    defineField({ name: "name", title: "Name", type: "string", group: "basics", validation: (r) => r.required() }),
    defineField({
      name: "sourceType",
      title: "Source Type",
      type: "string",
      group: "basics",
      options: {
        list: [
          { title: "RSS Feed", value: "rss" },
          { title: "API", value: "api" },
          { title: "Press Release", value: "press-release" },
          { title: "Partner (direct relationship)", value: "partner" },
          { title: "Manual (editor-submitted)", value: "manual" },
        ],
      },
      initialValue: "manual",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "url",
      title: "Website",
      type: "url",
      group: "access",
      description: "The publisher's main site — not necessarily the feed/API endpoint itself.",
    }),
    defineField({
      name: "feedUrl",
      title: "Feed / API Endpoint URL",
      type: "url",
      group: "access",
      description: "The actual RSS/Atom/API URL a future fetcher would read from. Leave blank for Manual sources.",
    }),
    defineField({
      name: "termsUrl",
      title: "Terms / Policy URL",
      type: "url",
      group: "access",
      description: "Link to the publisher's terms of use, syndication policy, or licensing page — the evidence behind the Permission Classification below.",
    }),

    // --- Permission & Licensing (legal fact) ---
    defineField({
      name: "permissionClassification",
      title: "Permission Classification",
      type: "string",
      group: "permission",
      options: {
        list: [
          { title: "Green — Syndication Permitted", value: "green" },
          { title: "Blue — Discovery/Linking Only", value: "blue" },
          { title: "Amber — Permission Unclear", value: "amber" },
          { title: "Red — Disallowed", value: "red" },
        ],
      },
      initialValue: "amber",
      validation: (r) => r.required(),
      description:
        'Do not assume permission merely because a feed exists or the publisher is reputable. Default every new source to Amber until someone has actually read the Terms/Policy URL above and can justify Green or Blue. Green = the source\'s own published terms explicitly allow the way Ordift intends to use the material. Blue = feed/API metadata may be used for discovery, but articles/images must not be reproduced — summary + "read at source" link only. Red = do not ingest at all.',
    }),
    defineField({
      name: "imageUsePermitted",
      title: "External Image Use Permitted",
      type: "boolean",
      group: "permission",
      initialValue: false,
      description:
        "Leave OFF unless this specific source's terms explicitly permit reusing their photography. When OFF, Creative Radar cards for this source must use an Ordift-owned presentation (category typography/graphic treatment) instead of the source's image.",
    }),
    defineField({
      name: "commercialUsePermitted",
      title: "Commercial Use Permitted",
      type: "boolean",
      group: "permission",
      initialValue: false,
      description: "Leave OFF unless explicitly verified against the source's terms.",
    }),
    defineField({
      name: "attributionRequirement",
      title: "Attribution Requirement",
      type: "text",
      rows: 2,
      group: "permission",
      description: 'e.g. "Must credit as \'via Vogue Business\' with a live link" — the exact wording/format this source requires, if any.',
    }),
    defineField({
      name: "licenseNotes",
      title: "License / Usage Notes",
      type: "text",
      rows: 3,
      group: "permission",
      description: "Freeform usage-rights or attribution terms agreed with this source, beyond the structured fields above.",
    }),
    defineField({
      name: "lastPolicyReviewDate",
      title: "Last Policy Review Date",
      type: "date",
      group: "permission",
      description: "When a human last actually checked this source's terms/policy page. A working feed must never change this — only a manual review does.",
    }),

    // --- Editorial (quality/reputation fact — independent of the above) ---
    defineField({
      name: "editorialTrustLevel",
      title: "Editorial Trust Level",
      type: "string",
      group: "editorial",
      options: {
        list: [
          { title: "High — established, reliable creative-industry authority", value: "high" },
          { title: "Standard — reasonable, no concerns", value: "standard" },
          { title: "Unverified — not yet assessed for editorial quality", value: "unverified" },
          { title: "Flagged — known quality/clickbait/accuracy concerns", value: "flagged" },
        ],
      },
      initialValue: "unverified",
      description:
        "Editorial reputation only — deliberately independent of Permission Classification above. A highly reputable publication can still be Amber/Blue on permissions; a legally reusable source can still be editorially weak.",
    }),
    defineField({
      name: "disciplines",
      title: "Disciplines",
      type: "array",
      group: "editorial",
      of: [{ type: "reference", to: [{ type: "pulseCategory" }] }],
      description: "Which Pulse categories this source typically covers — used for topic classification and relevance scoring.",
    }),
    defineField({
      name: "geography",
      title: "Geography",
      type: "array",
      group: "editorial",
      of: [{ type: "reference", to: [{ type: "pulseRegion" }] }],
      description: "Which regions this source's coverage is relevant to — used for regional relevance scoring.",
    }),
    defineField({
      name: "editorialPriority",
      title: "Editorial Priority",
      type: "number",
      group: "editorial",
      initialValue: 0,
      description: "Manual weighting an admin can raise for a source Ordift particularly trusts/values — one input to the relevance score, not a publishing decision by itself.",
    }),

    // --- Auto-Publish ---
    defineField({
      name: "isActive",
      title: "Active",
      type: "boolean",
      group: "autoPublish",
      initialValue: false,
      description:
        "OFF by default. A source only participates in any future discovery run once an Admin/Super Admin deliberately switches this on after reviewing its Permission Classification — never automatically.",
    }),
    defineField({
      name: "autoPublishEligible",
      title: "Auto-Publish Eligible",
      type: "boolean",
      group: "autoPublish",
      initialValue: false,
      validation: (r) =>
        r.custom((value, context) => {
          const doc = context.document as { permissionClassification?: string } | undefined;
          if (value && doc?.permissionClassification !== "green") {
            return "Auto-Publish Eligible can only be enabled for a Green (Syndication Permitted) source.";
          }
          return true;
        }),
      description:
        "OFF by default, and only meaningful for Green sources. Even when eligible here, the global Auto-Publish switch (Pulse Settings) must also be on for anything to publish without human review — see PULSE_INGESTION_FOUNDATION.md.",
    }),
  ],
  preview: {
    select: { title: "name", sourceType: "sourceType", permission: "permissionClassification", active: "isActive" },
    prepare({ title, sourceType, permission, active }) {
      return { title, subtitle: `${sourceType} · ${permission ?? "amber"} · ${active ? "active" : "inactive"}` };
    },
  },
});
