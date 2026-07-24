// Ports the same [SAMPLE]-labeled placeholder content that ships in
// src/lib/content/local/* into the live `staging` Sanity dataset, so the
// contentRepository flip (index.ts) can be verified against equivalent
// content instead of an empty CMS. Requested explicitly as part of the
// live-connection milestone — NOT run automatically, and NOT intended for
// the `production` dataset. Reuses each local record's existing `id` as
// the Sanity document `_id`, so cross-references resolve without a
// lookup table. Image/file asset fields are left unset — there are no
// real media files to upload; attach real images via Studio's media
// library once real content replaces these placeholders.
//
// Usage: npm run seed:sanity-sample-data

import { createClient } from "@sanity/client";
import {
  CATEGORIES,
  INSTRUCTORS,
  SPONSORS,
  TESTIMONIALS,
  VENUES,
  WORKSHOPS,
} from "../src/lib/content/local/data";
import { AUTHORS, JOURNAL_CATEGORIES, JOURNAL_POSTS } from "../src/lib/content/local/journalData";
import {
  PORTFOLIO_CATEGORIES,
  PORTFOLIO_COLLECTIONS,
  PORTFOLIO_PROJECTS,
  PORTFOLIO_TESTIMONIALS,
} from "../src/lib/content/local/portfolioData";
import type { Category, GalleryImage, MediaAsset } from "../src/lib/content/types";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "staging";
const token = process.env.SANITY_API_TOKEN;

if (!projectId || !token) {
  console.error("Missing NEXT_PUBLIC_SANITY_PROJECT_ID or SANITY_API_TOKEN — see CMS_MIGRATION.md.");
  process.exit(1);
}
if (dataset === "production") {
  console.error("Refusing to seed placeholder [SAMPLE] content into the production dataset.");
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: process.env.SANITY_API_VERSION || "2025-01-01",
  useCdn: false,
});

const slugField = (current: string) => ({ _type: "slug", current });
const refs = (ids: string[]) => ids.map((id) => ({ _type: "reference", _ref: id, _key: id }));
const ref = (id: string | null) => (id ? { _type: "reference", _ref: id } : undefined);

function mediaAssetDoc(m: MediaAsset) {
  const doc: Record<string, unknown> = { _type: "mediaAsset", type: m.type, alt: m.alt };
  if (m.type === "embed" && m.url) doc.url = m.url;
  return doc;
}
function galleryImageDoc(g: GalleryImage) {
  return { _type: "galleryImage", _key: g.id, alt: g.alt, caption: g.caption ?? undefined };
}
function categoryDoc(sanityType: string, c: Category) {
  return { _id: c.id, _type: sanityType, name: c.name, slug: slugField(c.slug), description: c.description };
}

async function seed() {
  const docs: Record<string, unknown>[] = [];

  for (const c of CATEGORIES) docs.push(categoryDoc("workshopCategory", c));
  for (const c of PORTFOLIO_CATEGORIES) docs.push(categoryDoc("portfolioCategory", c));
  for (const c of JOURNAL_CATEGORIES) docs.push(categoryDoc("journalCategory", c));

  for (const v of VENUES) {
    docs.push({ _id: v.id, _type: "venue", name: v.name, addressLine: v.addressLine ?? undefined, format: v.format, mapUrl: v.mapUrl ?? undefined });
  }

  for (const i of INSTRUCTORS) {
    docs.push({
      _id: i.id, _type: "instructor", name: i.name, slug: slugField(i.slug),
      jobTitle: i.title, bio: i.bio, credentials: i.credentials, isPlaceholder: i.isPlaceholder,
    });
  }

  for (const s of SPONSORS) {
    docs.push({ _id: s.id, _type: "sponsor", name: s.name, url: s.url ?? undefined, isPlaceholder: s.isPlaceholder });
  }

  for (const t of [...TESTIMONIALS, ...PORTFOLIO_TESTIMONIALS]) {
    docs.push({ _id: t.id, _type: "testimonial", quote: t.quote, authorName: t.authorName, authorRole: t.authorRole ?? undefined, isPlaceholder: t.isPlaceholder });
  }

  for (const a of AUTHORS) {
    docs.push({ _id: a.id, _type: "author", name: a.name, slug: slugField(a.slug), jobTitle: a.title, bio: a.bio, isPlaceholder: a.isPlaceholder });
  }

  for (const c of PORTFOLIO_COLLECTIONS) {
    docs.push({ _id: c.id, _type: "portfolioCollection", name: c.name, slug: slugField(c.slug), description: c.description, isOrdered: c.isOrdered });
  }

  for (const w of WORKSHOPS) {
    docs.push({
      _id: w.id, _type: "workshop", title: w.title, slug: slugField(w.slug),
      status: w.status, shortDescription: w.shortDescription, description: w.description,
      categories: refs(w.categoryIds), instructors: refs(w.instructorIds),
      venue: ref(w.venueId), capacity: w.capacity, startDate: w.startDate ?? undefined,
      endDate: w.endDate ?? undefined, registrationDeadline: w.registrationDeadline ?? undefined,
      experienceLevels: w.experienceLevels, requiresPayment: w.requiresPayment,
      learningOutcomes: w.learningOutcomes,
      agenda: w.agenda.map((a) => ({ _key: a.id, _type: "agendaItem", time: a.time, title: a.title, description: a.description ?? undefined })),
      gallery: w.gallery.map(galleryImageDoc),
      faqs: w.faqs.map((f) => ({ _key: f.id, _type: "faqItem", question: f.question, answer: f.answer })),
      certificate: w.certificate,
      testimonials: refs(w.testimonialIds), sponsors: refs(w.sponsorIds),
      relatedWorkshops: refs(w.relatedWorkshopIds), isRecurring: w.isRecurring,
      recurrenceNote: w.recurrenceNote ?? undefined,
      isOnlineAttendancePossible: w.isOnlineAttendancePossible,
      hasRecordedSession: w.hasRecordedSession, isMembersOnly: w.isMembersOnly,
    });
  }

  for (const p of PORTFOLIO_PROJECTS) {
    docs.push({
      _id: p.id, _type: "portfolioProject", title: p.title, slug: slugField(p.slug),
      status: p.status, featured: p.featured, heroMedia: mediaAssetDoc(p.heroMedia),
      disciplines: p.disciplines, categories: refs(p.categoryIds), collections: refs(p.collectionIds),
      seriesOrder: p.seriesOrder ?? undefined, client: p.client ?? undefined, year: p.year ?? undefined,
      location: p.location ?? undefined, servicesProvided: p.servicesProvided, equipmentUsed: p.equipmentUsed,
      collaborators: p.collaborators.map((c) => ({ _key: c.id, _type: "collaborator", name: c.name, role: c.role })),
      story: p.story, objective: p.objective ?? undefined, strategy: p.strategy ?? undefined,
      challenges: p.challenges ?? undefined, solution: p.solution ?? undefined, process: p.process ?? undefined,
      deliverables: p.deliverables, results: p.results ?? undefined,
      awards: p.awards.map((a) => ({ _key: a.id, _type: "award", title: a.title, issuer: a.issuer, year: a.year ?? undefined })),
      publications: p.publications.map((pub) => ({ _key: pub.id, _type: "publication", name: pub.name, url: pub.url ?? undefined, year: pub.year ?? undefined })),
      gallery: p.gallery.map(galleryImageDoc),
      behindTheScenesGallery: p.behindTheScenesGallery.map(galleryImageDoc),
      beforeAfterGallery: p.beforeAfterGallery.map((ba) => ({
        _key: ba.id, _type: "beforeAfterPair", before: mediaAssetDoc(ba.before), after: mediaAssetDoc(ba.after), caption: ba.caption ?? undefined,
      })),
      videos: p.videos.map(mediaAssetDoc),
      downloadableAssets: p.downloadableAssets.map((d) => ({ _key: d.id, _type: "downloadableAsset", label: d.label, fileType: d.fileType })),
      testimonials: refs(p.testimonialIds), relatedProjects: refs(p.relatedProjectIds),
      relatedWorkshops: refs(p.relatedWorkshopIds), isPasswordProtected: p.isPasswordProtected,
    });
  }

  for (const j of JOURNAL_POSTS) {
    docs.push({
      _id: j.id, _type: "journalPost", title: j.title, slug: slugField(j.slug), status: j.status,
      featured: j.featured, format: j.format, author: ref(j.authorId), categories: refs(j.categoryIds),
      tags: j.tags, heroImage: mediaAssetDoc(j.heroImage), videoUrl: j.videoUrl ?? undefined,
      excerpt: j.excerpt, body: j.body, publishedAt: j.publishedAt ?? undefined,
      scheduledFor: j.scheduledFor ?? undefined, relatedPosts: refs(j.relatedPostIds),
      relatedProjects: refs(j.relatedProjectIds), relatedWorkshops: refs(j.relatedWorkshopIds),
      newsletterExcerpt: j.newsletterExcerpt ?? undefined,
    });
  }

  console.log(`Seeding ${docs.length} documents into dataset "${dataset}"...`);
  let tx = client.transaction();
  for (const doc of docs) tx = tx.createOrReplace(doc as never);
  await tx.commit();
  console.log(`Done. ${docs.length} documents written.`);
}

seed().catch((err) => {
  console.error("Seed failed:", err.message ?? err);
  process.exit(1);
});
