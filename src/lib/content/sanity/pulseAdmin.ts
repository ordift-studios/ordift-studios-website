// Native-draft architecture (2026-08-27) — admin/editorial code binds
// explicitly to editorialClient (perspective: "drafts") rather than the
// bare, apiVersion-dependent-default client. Aliased to `client` so
// every other call site in this file is unchanged.
import { editorialClient as client } from "@/sanity/lib/client";
import { getPulsePublishReadiness } from "@/lib/pulse/publishReadiness";
import type { PulseEditorialTrustLevel, PulsePermissionClassification } from "../types";

// Admin-only Sanity read/write for the Ordift Pulse review interface
// (Phase D, 2026-08-24 — see PULSE_INGESTION_FOUNDATION.md). Same
// standalone-admin-layer pattern as homepageAboutVisualsAdmin.ts — deals
// directly in Sanity's write client rather than going through
// ContentRepository (which is public-read-only by design).
//
// `status` values relevant here: "draft" and "inReview" are the review
// queue; "published"/"archived" are terminal for this module's purposes.
// There is no dedicated "rejected" PulseStatus value in the schema — per
// explicit direction, adding one wasn't necessary for this minimal
// interface. "Reject" instead adds a `rejected` tag while leaving status
// at "draft", and the review queue excludes anything already tagged
// `rejected` by default (surfaced separately) — this is a UI-layer
// convention on top of the existing `tags` field, not a schema change.

export type PulseReviewQueueItem = {
  id: string;
  title: string;
  status: string;
  sourceName: string | null;
  sourcePermission: PulsePermissionClassification;
  sourceTrust: PulseEditorialTrustLevel;
  categoryNames: string[];
  regionNames: string[];
  relevanceScore: number | null;
  isDuplicate: boolean;
  duplicateOfTitle: string | null;
  isRejected: boolean;
  isFlaggedForReview: boolean;
  createdAt: string;
};

const REVIEW_QUEUE_QUERY = `*[_type == "pulseArticle" && status in ["draft", "inReview"]] | order(_createdAt desc) {
  "id": _id,
  title,
  status,
  "sourceName": source->name,
  "sourcePermission": coalesce(source->permissionClassification, "amber"),
  "sourceTrust": coalesce(source->editorialTrustLevel, "unverified"),
  "categoryNames": categories[]->name,
  "regionNames": regions[]->name,
  relevanceScore,
  "isDuplicate": defined(possibleDuplicateOf),
  "duplicateOfTitle": possibleDuplicateOf->title,
  "isRejected": "rejected" in tags,
  "isFlaggedForReview": "flagged-for-review" in tags,
  "createdAt": _createdAt
}`;

export async function getPulseReviewQueue(): Promise<PulseReviewQueueItem[]> {
  return client.fetch<PulseReviewQueueItem[]>(REVIEW_QUEUE_QUERY);
}

export type PulseArticleDetail = {
  id: string;
  title: string;
  status: string;
  origin: string;
  excerpt: string;
  body: string;
  aiSummary: string | null;
  hasHeroMedia: boolean;
  sourceUrl: string | null;
  sourceAttribution: string | null;
  publishedAt: string | null;
  relevanceScore: number | null;
  tags: string[];
  categoryNames: string[];
  regionNames: string[];
  source: { id: string; name: string; permissionClassification: PulsePermissionClassification; editorialTrustLevel: PulseEditorialTrustLevel; imageUsePermitted: boolean } | null;
  duplicateOf: { id: string; title: string } | null;
};

const ARTICLE_DETAIL_QUERY = `*[_type == "pulseArticle" && _id == $id][0]{
  "id": _id,
  title,
  status,
  origin,
  excerpt,
  body,
  aiSummary,
  "hasHeroMedia": defined(heroMedia),
  sourceUrl,
  sourceAttribution,
  publishedAt,
  relevanceScore,
  tags,
  "categoryNames": categories[]->name,
  "regionNames": regions[]->name,
  "source": source->{"id": _id, name, "permissionClassification": coalesce(permissionClassification, "amber"), "editorialTrustLevel": coalesce(editorialTrustLevel, "unverified"), "imageUsePermitted": coalesce(imageUsePermitted, false)},
  "duplicateOf": possibleDuplicateOf->{"id": _id, title}
}`;

export async function getPulseArticleDetail(id: string): Promise<PulseArticleDetail | null> {
  return client.fetch<PulseArticleDetail | null>(ARTICLE_DETAIL_QUERY, { id });
}

export type PulseArticleAction = "publish" | "reject" | "archive" | "restore";

export async function transitionPulseArticle(id: string, action: PulseArticleAction): Promise<{ ok: boolean; error?: string }> {
  const article = await client.fetch<{ tags: string[] | null; publishedAt: string | null; excerpt: string; body: string; title: string; hasHeroMedia: boolean } | null>(
    `*[_type == "pulseArticle" && _id == $id][0]{tags, publishedAt, excerpt, body, title, "hasHeroMedia": defined(heroMedia)}`,
    { id }
  );
  if (!article) return { ok: false, error: "Article not found." };

  const tags = article.tags ?? [];

  if (action === "publish") {
    const readiness = getPulsePublishReadiness({ title: article.title, excerpt: article.excerpt, body: article.body, hasHeroMedia: article.hasHeroMedia });
    if (!readiness.ready) {
      return { ok: false, error: readiness.blockers.join(" ") };
    }

    const publishedAt = article.publishedAt ?? new Date().toISOString();
    const cleanTags = tags.filter((t) => t !== "rejected");

    // Native-draft architecture (2026-08-27) — a genuine Sanity draft
    // (`drafts.<id>`, produced by discovery under this architecture)
    // must move to the published namespace and gain
    // `status: "published"` as one atomic, fail-closed unit: either
    // both changes land, or neither does. Sanity's Actions API
    // (`client.action([...])`, verified supported by the installed
    // @sanity/client) executes an array of actions as a single atomic
    // operation server-side — there is no partial-success state to
    // guard against, unlike a sequential patch-then-publish (or
    // publish-then-patch) would have. If this throws, the article is
    // left exactly as it was: a genuine draft with status "draft",
    // invisible to publicClient's perspective:"published" AND excluded
    // by the status=="published" query filter — both layers intact.
    //
    // A pre-existing article with no `drafts.` id (the five Test #3
    // articles that predate this architecture — deliberately left
    // unmigrated) has no draft document for Sanity to publish; for
    // those, publication is still exactly the plain status patch this
    // function always performed, since Sanity's own document-state
    // offers them nothing extra to coordinate.
    const DRAFT_ID_PREFIX = "drafts.";
    if (id.startsWith(DRAFT_ID_PREFIX)) {
      const publishedId = id.slice(DRAFT_ID_PREFIX.length);
      try {
        await client.action([
          {
            actionType: "sanity.action.document.edit",
            draftId: id,
            publishedId,
            patch: { set: { status: "published", publishedAt, tags: cleanTags } },
          },
          {
            actionType: "sanity.action.document.publish",
            draftId: id,
            publishedId,
          },
        ]);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Publish failed." };
      }
      return { ok: true };
    }

    await client
      .patch(id)
      .set({ status: "published", publishedAt, tags: cleanTags })
      .commit();
    return { ok: true };
  }

  if (action === "reject") {
    await client
      .patch(id)
      .set({ status: "draft", tags: tags.includes("rejected") ? tags : [...tags, "rejected"] })
      .commit();
    return { ok: true };
  }

  if (action === "restore") {
    await client
      .patch(id)
      .set({ status: "draft", tags: tags.filter((t) => t !== "rejected") })
      .commit();
    return { ok: true };
  }

  if (action === "archive") {
    await client.patch(id).set({ status: "archived" }).commit();
    return { ok: true };
  }

  return { ok: false, error: "Unknown action." };
}

// --- Source management ---

export type PulseSourceAdminRow = {
  id: string;
  name: string;
  sourceType: string;
  isActive: boolean;
  permissionClassification: PulsePermissionClassification;
  editorialTrustLevel: PulseEditorialTrustLevel;
  autoPublishEligible: boolean;
  lastPolicyReviewDate: string | null;
};

const SOURCES_ADMIN_QUERY = `*[_type == "pulseSource"] | order(name asc) {
  "id": _id, name, sourceType,
  "isActive": coalesce(isActive, false),
  "permissionClassification": coalesce(permissionClassification, "amber"),
  "editorialTrustLevel": coalesce(editorialTrustLevel, "unverified"),
  "autoPublishEligible": coalesce(autoPublishEligible, false),
  lastPolicyReviewDate
}`;

export async function getPulseSourcesAdmin(): Promise<PulseSourceAdminRow[]> {
  return client.fetch<PulseSourceAdminRow[]>(SOURCES_ADMIN_QUERY);
}

export type PulseSourceAdminDetail = PulseSourceAdminRow & {
  url: string | null;
  feedUrl: string | null;
  termsUrl: string | null;
  licenseNotes: string | null;
  imageUsePermitted: boolean;
  commercialUsePermitted: boolean;
  attributionRequirement: string | null;
  editorialPriority: number;
};

const SOURCE_DETAIL_QUERY = `*[_type == "pulseSource" && _id == $id][0]{
  "id": _id, name, sourceType, url, feedUrl, termsUrl, licenseNotes, lastPolicyReviewDate,
  "isActive": coalesce(isActive, false),
  "permissionClassification": coalesce(permissionClassification, "amber"),
  "imageUsePermitted": coalesce(imageUsePermitted, false),
  "commercialUsePermitted": coalesce(commercialUsePermitted, false),
  attributionRequirement,
  "editorialTrustLevel": coalesce(editorialTrustLevel, "unverified"),
  "editorialPriority": coalesce(editorialPriority, 0),
  "autoPublishEligible": coalesce(autoPublishEligible, false)
}`;

export async function getPulseSourceAdminDetail(id: string): Promise<PulseSourceAdminDetail | null> {
  return client.fetch<PulseSourceAdminDetail | null>(SOURCE_DETAIL_QUERY, { id });
}

export type PulseSourceUpdateFields = {
  isActive: boolean;
  permissionClassification: PulsePermissionClassification;
  editorialTrustLevel: PulseEditorialTrustLevel;
  imageUsePermitted: boolean;
  commercialUsePermitted: boolean;
  autoPublishEligible: boolean;
  attributionRequirement: string | null;
  lastPolicyReviewDate: string | null;
};

// App-layer enforcement of the same rule the Studio schema's own
// validation enforces (defense in depth — Content Lake writes don't go
// through Studio's client-side validation, so this must be checked here
// too, not assumed): Auto-Publish Eligible can only be true for a Green
// source.
export async function updatePulseSourceAdmin(id: string, fields: PulseSourceUpdateFields): Promise<{ ok: boolean; error?: string }> {
  if (fields.autoPublishEligible && fields.permissionClassification !== "green") {
    return { ok: false, error: "Auto-Publish Eligible can only be enabled for a Green (Syndication Permitted) source." };
  }
  await client
    .patch(id)
    .set({
      isActive: fields.isActive,
      permissionClassification: fields.permissionClassification,
      editorialTrustLevel: fields.editorialTrustLevel,
      imageUsePermitted: fields.imageUsePermitted,
      commercialUsePermitted: fields.commercialUsePermitted,
      autoPublishEligible: fields.autoPublishEligible,
      attributionRequirement: fields.attributionRequirement,
      lastPolicyReviewDate: fields.lastPolicyReviewDate,
    })
    .commit();
  return { ok: true };
}
