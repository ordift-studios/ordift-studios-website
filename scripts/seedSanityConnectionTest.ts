// One-time connection-verification script — NOT a migration of the local
// [SAMPLE] placeholder content into your real CMS. Porting fake sample
// records into a brand-new, Ordift-owned Sanity project would just mean
// deleting them later; the point of this script is smaller and more
// useful: prove the project/dataset/token actually work end-to-end by
// creating one small, clearly-labeled test record per connected content
// type, then querying it back through the exact same adapter the site
// will use.
//
// Usage (after you've created the Sanity project and set env vars):
//   npx tsx scripts/seedSanityConnectionTest.ts
//
// Requires SANITY_API_TOKEN with Editor (write) permissions — create one
// at https://www.sanity.io/manage under your project > API > Tokens.
// Never commit this token; it only ever belongs in .env.local / your
// deployment platform's env settings.
//
// After running: open /studio, confirm the "[CONNECTION TEST]" documents
// exist, then delete them once you're satisfied the connection works —
// they're a smoke test, not real content.

import { createClient } from "@sanity/client";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "staging";
const token = process.env.SANITY_API_TOKEN;

if (!projectId || !token) {
  console.error(
    "Missing NEXT_PUBLIC_SANITY_PROJECT_ID or SANITY_API_TOKEN. Set these in .env.local after creating the Sanity project — see CMS_MIGRATION.md."
  );
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: process.env.SANITY_API_VERSION || "2025-01-01",
  useCdn: false,
});

async function seed() {
  const category = await client.createOrReplace({
    _id: "connection-test-workshop-category",
    _type: "workshopCategory",
    name: "[CONNECTION TEST] Category",
    slug: { _type: "slug", current: "connection-test-category" },
    description: "Created by scripts/seedSanityConnectionTest.ts — safe to delete.",
  });

  const workshop = await client.createOrReplace({
    _id: "connection-test-workshop",
    _type: "workshop",
    title: "[CONNECTION TEST] Workshop",
    slug: { _type: "slug", current: "connection-test-workshop" },
    status: "coming-soon",
    shortDescription: "Created by scripts/seedSanityConnectionTest.ts — safe to delete.",
    description: "This document exists only to verify the Sanity connection. Delete it once confirmed.",
    categories: [{ _type: "reference", _ref: category._id }],
    capacity: 1,
    experienceLevels: [],
    requiresPayment: false,
    learningOutcomes: [],
    agenda: [],
    gallery: [],
    faqs: [],
    certificate: { offered: false },
    testimonials: [],
    sponsors: [],
    relatedWorkshops: [],
    isRecurring: false,
    isOnlineAttendancePossible: false,
    hasRecordedSession: false,
    isMembersOnly: false,
  });

  console.log("Seeded connection-test documents:");
  console.log(`  - workshopCategory: ${category._id}`);
  console.log(`  - workshop: ${workshop._id}`);
  console.log("\nOpen /studio to see them, or run the query the frontend uses:");
  console.log('  client.fetch(`*[_type == "workshop" && slug.current == "connection-test-workshop"][0]`)');
  console.log("\nDelete both documents once you've confirmed the connection works.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
