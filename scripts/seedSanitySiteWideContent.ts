// Ports the real, already-approved site-wide copy (Home, About, Founder,
// Services, Navigation, Footer, Legal pages) from
// src/lib/content/local/siteWideData.ts into Sanity. Unlike
// seedSanitySampleData.ts, this is NOT placeholder content — it's the
// same copy that was live in the hardcoded page components — so it's
// seeded into BOTH `staging` and `production` datasets, since both
// environments need the real site to render correctly (this differs from
// the Workshops/Portfolio/Stories sample data, which is intentionally
// staging-only placeholder content).
//
// Usage: npm run seed:sanity-site-wide

import { createClient } from "@sanity/client";
import {
  ABOUT_PAGE,
  FOOTER_SETTINGS,
  FOUNDER,
  HOME_PAGE,
  LEGAL_PAGES,
  NAVIGATION,
  SERVICES,
  SITE_SETTINGS,
} from "../src/lib/content/local/siteWideData";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const token = process.env.SANITY_API_TOKEN;

if (!projectId || !token) {
  console.error("Missing NEXT_PUBLIC_SANITY_PROJECT_ID or SANITY_API_TOKEN — see CMS_MIGRATION.md.");
  process.exit(1);
}

function clientFor(dataset: string) {
  return createClient({
    projectId: projectId as string,
    dataset,
    token,
    apiVersion: process.env.SANITY_API_VERSION || "2025-01-01",
    useCdn: false,
  });
}

function buildDocs() {
  const docs: Record<string, unknown>[] = [];

  docs.push({
    _id: "siteSettings",
    _type: "siteSettings",
    siteName: SITE_SETTINGS.siteName,
    tagline: SITE_SETTINGS.tagline ?? undefined,
    contactEmail: SITE_SETTINGS.contactEmail,
    whatsappNumber: SITE_SETTINGS.whatsappNumber,
    socialLinks: SITE_SETTINGS.socialLinks,
    defaultSeo: { metaTitle: SITE_SETTINGS.defaultSeo.metaTitle, metaDescription: SITE_SETTINGS.defaultSeo.metaDescription },
  });

  docs.push({
    _id: "homepage",
    _type: "homepage",
    heroEyebrow: HOME_PAGE.heroEyebrow,
    heroHeadline: HOME_PAGE.heroHeadline,
    heroSubheadline: HOME_PAGE.heroSubheadline,
    heroPrimaryCta: HOME_PAGE.heroPrimaryCta,
    heroSecondaryCta: HOME_PAGE.heroSecondaryCta,
    whoWeAreEyebrow: HOME_PAGE.whoWeAreEyebrow,
    whoWeAreBody: HOME_PAGE.whoWeAreBody,
    originalsEyebrow: HOME_PAGE.originalsEyebrow,
    originalsHeadline: HOME_PAGE.originalsHeadline,
    originalsBody: HOME_PAGE.originalsBody,
    process: HOME_PAGE.process.map((p, i) => ({ _key: `step-${i}`, ...p })),
    ctaHeadline: HOME_PAGE.ctaHeadline,
    ctaBody: HOME_PAGE.ctaBody,
    ctaPrimary: HOME_PAGE.ctaPrimary,
    ctaSecondary: HOME_PAGE.ctaSecondary,
    seo: { metaTitle: HOME_PAGE.seo.metaTitle, metaDescription: HOME_PAGE.seo.metaDescription },
  });

  docs.push({
    _id: "aboutPage",
    _type: "aboutPage",
    heroEyebrow: ABOUT_PAGE.heroEyebrow,
    heroHeadline: ABOUT_PAGE.heroHeadline,
    storyEyebrow: ABOUT_PAGE.storyEyebrow,
    storyHeadline: ABOUT_PAGE.storyHeadline,
    storyBody: ABOUT_PAGE.storyBody,
    mission: ABOUT_PAGE.mission,
    vision: ABOUT_PAGE.vision,
    values: ABOUT_PAGE.values.map((v, i) => ({ _key: `value-${i}`, ...v })),
    teamEyebrow: ABOUT_PAGE.teamEyebrow,
    teamHeadline: ABOUT_PAGE.teamHeadline,
    teamBody: ABOUT_PAGE.teamBody,
    ctaHeadline: ABOUT_PAGE.ctaHeadline,
    ctaBody: ABOUT_PAGE.ctaBody,
    seo: { metaTitle: ABOUT_PAGE.seo.metaTitle, metaDescription: ABOUT_PAGE.seo.metaDescription },
  });

  docs.push({
    _id: "founder",
    _type: "founder",
    name: FOUNDER.name,
    jobTitle: FOUNDER.title,
    bio: FOUNDER.bio,
  });

  docs.push({
    _id: "navigation",
    _type: "navigation",
    links: NAVIGATION.links.map((l, i) => ({ _key: `link-${i}`, ...l })),
    primaryCta: NAVIGATION.primaryCta,
  });

  docs.push({
    _id: "footerSettings",
    _type: "footerSettings",
    tagline: FOOTER_SETTINGS.tagline,
    columns: FOOTER_SETTINGS.columns.map((c, i) => ({
      _key: `col-${i}`,
      heading: c.heading,
      links: c.links.map((l, j) => ({ _key: `col-${i}-link-${j}`, ...l })),
    })),
  });

  for (const s of SERVICES) {
    docs.push({
      _id: s.id,
      _type: "service",
      name: s.name,
      slug: { _type: "slug", current: s.slug },
      summaryDescription: s.summaryDescription,
      heroEyebrow: s.heroEyebrow,
      heroHeadline: s.heroHeadline,
      heroBody: s.heroBody,
      offeringsHeadline: s.offeringsHeadline,
      offerings: s.offerings,
      additionalHeading: s.additionalHeading ?? undefined,
      additionalItems: s.additionalItems,
      ctaEyebrow: s.ctaEyebrow ?? undefined,
      ctaHeadline: s.ctaHeadline,
      ctaBody: s.ctaBody,
      ctaPrimaryLabel: s.ctaPrimaryLabel,
      ctaSecondaryLabel: s.ctaSecondaryLabel ?? undefined,
      isComingSoon: s.isComingSoon,
      displayOrder: s.displayOrder,
      seo: { metaTitle: s.seo.metaTitle, metaDescription: s.seo.metaDescription },
    });
  }

  for (const p of LEGAL_PAGES) {
    docs.push({
      _id: `legalPage-${p.slug}`,
      _type: "legalPage",
      title: p.title,
      slug: { _type: "slug", current: p.slug },
      body: p.body,
      isApproved: p.isApproved,
      lastUpdated: p.lastUpdated ?? undefined,
    });
  }

  return docs;
}

async function seedDataset(dataset: string) {
  const client = clientFor(dataset);
  const docs = buildDocs();
  console.log(`Seeding ${docs.length} site-wide documents into dataset "${dataset}"...`);
  let tx = client.transaction();
  for (const doc of docs) tx = tx.createOrReplace(doc as never);
  await tx.commit();
  console.log(`Done: "${dataset}".`);
}

async function main() {
  await seedDataset("staging");
  await seedDataset("production");
}

main().catch((err) => {
  console.error("Seed failed:", err.message ?? err);
  process.exit(1);
});
