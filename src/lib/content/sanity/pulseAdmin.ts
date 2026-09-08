// Native-draft architecture (2026-08-27) — admin/editorial code binds
// explicitly to editorialClient (perspective: "drafts") rather than the
// bare, apiVersion-dependent-default client. Aliased to `client` so
// every other call site in this file is unchanged.
import { editorialClient as client } from "@/sanity/lib/client";
import { getPulsePublishReadiness } from "@/lib/pulse/publishReadiness";
import { mediaAssetFragment } from "./groqFragments";
import type { PulseEditorialTrustLevel, PulsePermissionClassification, PulseSourceClassification, MediaAsset } from "../types";
import {
  evaluatePolicyText,
  buildPolicyCheckTrustSuggestion,
  buildPolicyCheckPatch,
  deriveOfficialDomain,
  extractPolicyCandidateLinks,
  buildFallbackCandidateEvidence,
  buildSubstantiveCandidateEvidence,
  isSameOrSubdomain,
  isWithinOfficialDomain,
  type PolicyCandidateLink,
  type PulsePolicyCheckRecommendation,
  type PolicyEvidenceItem,
} from "@/lib/pulse/policyEvidence";
import { safeFetchText } from "@/lib/pulse/policyCheckFetch";
import { isSafeFetchTarget } from "@/lib/pulse/urlSafety";

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

// Deliberately still plain _id, not _originalId — verified live before
// this change (Controlled Test #6G pre-deploy check): under
// editorialClient's perspective:"drafts", a query FILTER of the form
// `_id == $id` only matches when $id is the canonicalized/bare form;
// `_id == "drafts.<uuid>"` matches nothing (returns null). This field
// feeds only <Link href={`/admin/pulse/${item.id}`}> in the review
// queue UI, and ARTICLE_DETAIL_QUERY below filters on that exact URL
// param via `_id == $id` — so it must stay canonical/bare for
// navigation to keep resolving. See ARTICLE_DETAIL_QUERY's own comment
// for where the actual TDR-015-class fix belongs.
const REVIEW_QUEUE_QUERY = `*[_type == "pulseArticle" && status in ["draft", "inReview"]] | order(_createdAt desc) {
  "id": _id,
  title,
  status,
  "sourceName": source->name,
  "sourcePermission": coalesce(source->permissionClassification, "unknown"),
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
  // Adaptive Discovery Remediation, Part 6 (2026-09-08) — the full
  // asset (not just the boolean) so the Admin review screen can
  // actually preview it, not merely report "Set". Null whenever
  // hasHeroMedia is false — the two are always consistent since both
  // come from the same `heroMedia` field.
  heroMedia: MediaAsset | null;
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

// Controlled Test #6F fix (2026-09-03) — same class of defect as
// TDR-015. This query is still correctly reached with the canonical
// (bare) $id (the URL param, sourced from REVIEW_QUEUE_QUERY's
// still-bare "id" above) — the FILTER `_id == $id` needs that form to
// match, verified live. The bug was specifically in what this query
// then handed BACK as the article's own "id": under
// editorialClient's perspective:"drafts", plain _id in the projection
// also returns that same canonicalized/bare form, even though the
// only document that actually exists is drafts.<id>. That bare id then
// flowed into the hidden form field ArticleActions.tsx submits to
// transitionPulseArticleAction, so a "Publish" click passed a bare id
// into transitionPulseArticle(), whose `id.startsWith("drafts.")`
// branch check evaluated false, falling through to the plain-patch
// path against a literal document id that doesn't exist (only the
// drafts.-prefixed one does) — which Sanity correctly rejected as "not
// found", confirmed live via the #6F diagnostic instrumentation.
// _originalId is the correct field for this exact purpose (see
// TECHNICAL_DECISION_RECORDS.md TDR-015) — used here only for the
// OUTPUT "id" field, not the filter above.
const ARTICLE_DETAIL_QUERY = `*[_type == "pulseArticle" && _id == $id][0]{
  "id": _originalId,
  title,
  status,
  origin,
  excerpt,
  body,
  aiSummary,
  "hasHeroMedia": defined(heroMedia),
  "heroMedia": select(defined(heroMedia) => heroMedia${mediaAssetFragment}, null),
  sourceUrl,
  sourceAttribution,
  publishedAt,
  relevanceScore,
  tags,
  "categoryNames": categories[]->name,
  "regionNames": regions[]->name,
  "source": source->{"id": _id, name, "permissionClassification": coalesce(permissionClassification, "unknown"), "editorialTrustLevel": coalesce(editorialTrustLevel, "unverified"), "imageUsePermitted": coalesce(imageUsePermitted, false)},
  "duplicateOf": possibleDuplicateOf->{"id": _id, title}
}`;

export async function getPulseArticleDetail(id: string): Promise<PulseArticleDetail | null> {
  return client.fetch<PulseArticleDetail | null>(ARTICLE_DETAIL_QUERY, { id });
}

export type PulseArticleAction = "publish" | "reject" | "archive" | "restore";

export async function transitionPulseArticle(id: string, action: PulseArticleAction): Promise<{ ok: boolean; error?: string }> {
  // Controlled Test #6G fix (2026-09-03) — a query FILTER of the form
  // `_id == $id` only matches the canonical/bare form under
  // editorialClient's perspective:"drafts" (verified live against
  // Staging); `_id == "drafts.<uuid>"` matches nothing, even though
  // that literal document is exactly what exists. Now that #6F's fix
  // correctly passes the literal drafts.-prefixed id into this
  // function, this initial lookup needs the bare form specifically —
  // confirmed live to resolve correctly either way (draft-only or
  // published-only) once normalized. Everything below this lookup
  // (the drafts.-prefix branch check, the Actions API call's draftId,
  // and the reject/restore/archive .patch(id) calls) intentionally
  // keeps using the original, unmodified `id` — patch operations and
  // Actions API calls target a document directly by its literal _id,
  // not perspective-filtered, so they need the real prefixed form.
  const DRAFT_ID_PREFIX = "drafts.";
  const lookupId = id.startsWith(DRAFT_ID_PREFIX) ? id.slice(DRAFT_ID_PREFIX.length) : id;
  const article = await client.fetch<
    { tags: string[] | null; publishedAt: string | null; excerpt: string; body: string; title: string; hasHeroMedia: boolean; origin: string; sourceUrl: string | null } | null
  >(`*[_type == "pulseArticle" && _id == $id][0]{tags, publishedAt, excerpt, body, title, "hasHeroMedia": defined(heroMedia), origin, sourceUrl}`, { id: lookupId });
  if (!article) return { ok: false, error: "Article not found." };

  const tags = article.tags ?? [];

  if (action === "publish") {
    const readiness = getPulsePublishReadiness({
      title: article.title,
      excerpt: article.excerpt,
      body: article.body,
      hasHeroMedia: article.hasHeroMedia,
      origin: article.origin,
      sourceUrl: article.sourceUrl,
    });
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

// Adaptive Discovery Remediation, Part 6 (2026-09-08) — completes the
// Admin hero-media workflow. A plain .patch(id).set(...).commit() —
// the exact same pattern reject/restore/archive above already use —
// works correctly whether `id` names a genuine draft (`drafts.<id>`)
// or a legacy pre-migration published article, with no branching
// needed (unlike publish's Actions-API path, which specifically
// coordinates a draft->published namespace move; setting a field on
// an existing document, draft or published, needs no such
// coordination). Never touches status/tags/any other field.
export async function setPulseArticleHeroMedia(
  id: string,
  heroMedia: { type: "image"; assetId: string; alt: string } | { type: "embed"; url: string; alt: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const doc =
    heroMedia.type === "image"
      ? { _type: "mediaAsset", type: "image", alt: heroMedia.alt, image: { _type: "image", asset: { _type: "reference", _ref: heroMedia.assetId } } }
      : { _type: "mediaAsset", type: "embed", alt: heroMedia.alt, url: heroMedia.url };
  try {
    await client.patch(id).set({ heroMedia: doc }).commit();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to set hero media." };
  }
}

export async function clearPulseArticleHeroMedia(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await client.patch(id).unset(["heroMedia"]).commit();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to clear hero media." };
  }
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
  // Official/Primary Source Discovery (2026-09-08).
  sourceClassification: PulseSourceClassification;
};

const SOURCES_ADMIN_QUERY = `*[_type == "pulseSource"] | order(name asc) {
  "id": _id, name, sourceType,
  "isActive": coalesce(isActive, false),
  "permissionClassification": coalesce(permissionClassification, "unknown"),
  "editorialTrustLevel": coalesce(editorialTrustLevel, "unverified"),
  "autoPublishEligible": coalesce(autoPublishEligible, false),
  lastPolicyReviewDate,
  "sourceClassification": coalesce(sourceClassification, "editorial_discovery")
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
  // Rights Intelligence / Freshness (2026-09-08).
  freshnessWindowDaysOverride: number | null;
  // Rights-Intelligence "Check Policy" evidence (2026-09-08) —
  // read-only, machine-set-only fields. Never editable from
  // SourceEditForm.tsx; only checkPulseSourcePolicy() below ever writes
  // them. See policyEvidence.ts for the full non-binding-evidence
  // design rationale.
  policyCheckedAt: string | null;
  policyCheckedUrl: string | null;
  policyCheckRecommendation: PulsePolicyCheckRecommendation | null;
  policyCheckEvidence: PolicyEvidenceItem[];
  policyCheckTrustSuggestion: string | null;
};

const SOURCE_DETAIL_QUERY = `*[_type == "pulseSource" && _id == $id][0]{
  "id": _id, name, sourceType, url, feedUrl, termsUrl, licenseNotes, lastPolicyReviewDate,
  "isActive": coalesce(isActive, false),
  "permissionClassification": coalesce(permissionClassification, "unknown"),
  "imageUsePermitted": coalesce(imageUsePermitted, false),
  "commercialUsePermitted": coalesce(commercialUsePermitted, false),
  attributionRequirement,
  "editorialTrustLevel": coalesce(editorialTrustLevel, "unverified"),
  "editorialPriority": coalesce(editorialPriority, 0),
  "autoPublishEligible": coalesce(autoPublishEligible, false),
  "sourceClassification": coalesce(sourceClassification, "editorial_discovery"),
  freshnessWindowDaysOverride,
  policyCheckedAt,
  policyCheckedUrl,
  policyCheckRecommendation,
  "policyCheckEvidence": coalesce(policyCheckEvidence[]{category, snippet, url}, []),
  policyCheckTrustSuggestion
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
  sourceClassification: PulseSourceClassification;
  termsUrl: string | null;
  licenseNotes: string | null;
  freshnessWindowDaysOverride: number | null;
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
  if (fields.freshnessWindowDaysOverride !== null && fields.freshnessWindowDaysOverride <= 0) {
    return { ok: false, error: "Freshness Window Override must be a positive number of days, or left blank." };
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
      sourceClassification: fields.sourceClassification,
      termsUrl: fields.termsUrl,
      licenseNotes: fields.licenseNotes,
      freshnessWindowDaysOverride: fields.freshnessWindowDaysOverride,
    })
    .commit();
  return { ok: true };
}

// Manual Source Addition, Part N (2026-09-08) — "I should NOT need
// Claude/code changes each time Ordift decides to monitor another
// company." Reuses the exact same document shape/defaults every
// existing source already has (matches pulseSource.ts's own
// initialValues: isActive false, permissionClassification "unknown",
// sourceClassification "editorial_discovery", editorialTrustLevel
// "unverified") — an admin only ever gets a genuinely new, inactive,
// unreviewed source this way, never a pre-activated one. No fetching,
// scraping, or discovery happens as a side effect of creating this
// document — see /admin/pulse/sources/page.tsx's own note that
// activating a source only makes it ELIGIBLE for a discovery run, it
// never runs one.
export type PulseSourceCreateFields = {
  name: string;
  sourceType: string;
  url: string | null;
  feedUrl: string | null;
  termsUrl: string | null;
  sourceClassification: PulseSourceClassification;
};

export async function createPulseSourceAdmin(fields: PulseSourceCreateFields): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!fields.name.trim()) return { ok: false, error: "Name is required." };
  try {
    const doc = await client.create({
      _type: "pulseSource",
      name: fields.name.trim(),
      sourceType: fields.sourceType,
      url: fields.url,
      feedUrl: fields.feedUrl,
      termsUrl: fields.termsUrl,
      sourceClassification: fields.sourceClassification,
      isActive: false,
      permissionClassification: "unknown",
      editorialTrustLevel: "unverified",
      autoPublishEligible: false,
      imageUsePermitted: false,
      commercialUsePermitted: false,
      editorialPriority: 0,
    });
    return { ok: true, id: doc._id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create the source." };
  }
}

// --- Rights Intelligence: "Check Policy" (2026-09-08) -------------------
// Evidence/recommendation assistance ONLY — see policyEvidence.ts's own
// header comment and PULSE_SOURCE_DECISION_FIELDS for the full design
// rationale. This function NEVER writes permissionClassification,
// isActive, imageUsePermitted, commercialUsePermitted,
// autoPublishEligible, editorialTrustLevel, attributionRequirement, or
// lastPolicyReviewDate — it can't, structurally: the only object it
// ever passes to .set() is buildPolicyCheckPatch()'s return value,
// whose fixed key set is POLICY_CHECK_WRITE_FIELDS (asserted against
// PULSE_SOURCE_DECISION_FIELDS by a real, non-doc test — see
// policyEvidence.test.ts).
//
// `sanity` and `fetchPolicyText` are injectable (same established
// pattern as runDiscoveryForSource()'s `sanity`/`now` params in
// ingestion.ts) purely for deterministic, network-free tests — every
// real call site (checkPulseSourcePolicyAction) omits both and gets the
// real editorialClient + safeFetchText().
export type PulsePolicyCheckResult =
  | {
      ok: true;
      recommendation: PulsePolicyCheckRecommendation;
      evidence: PolicyEvidenceItem[];
      checkedAt: string;
      checkedUrl: string;
      trustSuggestion: string | null;
    }
  | { ok: false; error: string };

export type PolicyCheckSanityClient = {
  fetch<T>(query: string, params?: Record<string, unknown>): Promise<T>;
  patch(id: string): { set(fields: Record<string, unknown>): { commit(): Promise<unknown> } };
};

const POLICY_CHECK_SOURCE_QUERY = `*[_type == "pulseSource" && _id == $id][0]{termsUrl, sourceClassification, url}`;

// Canonicalizes a URL for exclusion-set comparison only (never for
// domain-trust decisions) — strips the fragment the same way
// resolveCandidateUrl() already does internally, so a deeper candidate
// that merely points back at a URL already seen this run (homepage,
// gateway, or the originally-failed termsUrl) is never presented as if
// it were newly discovered. Falls back to the raw string on a malformed
// URL — never throws.
function canonicalizeForExclusion(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

// Official-Domain Policy Discovery Fallback + One-Hop Gateway
// Resolution (2026-09-08) — attempted ONLY when the saved Policy/Rights
// URL itself couldn't be evaluated. Never produces candidate-green/
// candidate-red on its own — even a found candidate (at either hop) is
// still just unevaluated evidence, never itself a classification — so
// the caller always keeps recommendation "inconclusive" whenever this
// path runs at all. Returns evidence items only; never touches
// termsUrl — see adoptPulseSourcePolicyCandidate() below for the
// separate, explicit-Admin-only write path.
//
// Exactly THREE fetches maximum ever happen for one Check Policy call:
// (1) the saved termsUrl (in checkPulseSourcePolicy, before this
// function is even called), (2) the source's own homepage, and (3) at
// most one gateway candidate found on that homepage. A same-domain link
// discovered ON the gateway page (the "substantive candidate") is only
// ever extracted from already-fetched HTML and presented — its content
// is NEVER fetched during this pass. That is what makes "at most one
// additional hop, then stop" a structural guarantee rather than a
// convention: there is no code path in this function that can issue a
// fourth fetch, regardless of what a gateway page links to.
async function runOfficialDomainFallback(
  websiteUrl: string | null,
  checkedUrl: string,
  primaryFailureReason: string,
  fetchPolicyText: (url: string) => Promise<Awaited<ReturnType<typeof safeFetchText>>>
): Promise<PolicyEvidenceItem[]> {
  const primaryFailureEvidence: PolicyEvidenceItem = {
    category: "fetch-error",
    snippet: `Could not evaluate the saved policy page — ${primaryFailureReason}.`,
  };

  if (!websiteUrl) return [primaryFailureEvidence];

  const officialDomain = deriveOfficialDomain(websiteUrl);
  if (!officialDomain) return [primaryFailureEvidence];

  // Fetch #2 — the source's own homepage.
  const homepageResult = await fetchPolicyText(websiteUrl);
  if (!homepageResult.ok) {
    return [
      primaryFailureEvidence,
      { category: "fetch-error", snippet: `Also could not check the official homepage for a fallback candidate — ${homepageResult.reason}.` },
    ];
  }
  // A redirect can silently move a "same-domain" request off-domain —
  // safeFetchText's own SSRF guard has no concept of "official domain"
  // (that's a PulseSource-specific boundary, not a generic safety
  // rule), so it happily follows a redirect to any other PUBLIC
  // address. This is the domain-specific check on top of that.
  if (!isWithinOfficialDomain(homepageResult.finalUrl, officialDomain)) {
    return [primaryFailureEvidence, { category: "safety-block", snippet: "The official homepage redirected outside the source's official domain — fallback discovery stopped." }];
  }

  const firstHopCandidates = extractPolicyCandidateLinks(homepageResult.text, homepageResult.finalUrl, officialDomain);
  if (firstHopCandidates.length === 0) {
    return [
      primaryFailureEvidence,
      { category: "website-general", snippet: "No candidate Terms/Legal/Copyright/Press page could be found on the official homepage." },
    ];
  }

  const evidence: PolicyEvidenceItem[] = [primaryFailureEvidence];
  const [topCandidate, ...restCandidates] = firstHopCandidates;

  // One additional hop — from the single best (first) first-hop
  // candidate ONLY, never from every candidate found, and never
  // recursively. This is the entire scope of "one hop deeper."
  let exploredDeeper = false;
  const gatewayFetch = await fetchPolicyText(topCandidate.url); // fetch #3 — the only one that can ever happen here
  if (gatewayFetch.ok && isWithinOfficialDomain(gatewayFetch.finalUrl, officialDomain)) {
    const gatewayEvaluation = evaluatePolicyText(gatewayFetch.text);
    if (!gatewayEvaluation.hasSignal) {
      // Looks like a gateway/index page (no policy language of its
      // own) — look for exactly one further same-domain policy link on
      // it, excluding anything already seen this run so a page that
      // merely links back to the homepage/itself/the original failed
      // termsUrl is never presented as a "new" discovery.
      const excluded = new Set(
        [websiteUrl, homepageResult.finalUrl, topCandidate.url, gatewayFetch.finalUrl, checkedUrl].map(canonicalizeForExclusion)
      );
      const deeperCandidates: PolicyCandidateLink[] = extractPolicyCandidateLinks(gatewayFetch.text, gatewayFetch.finalUrl, officialDomain, 1).filter(
        (c) => !excluded.has(canonicalizeForExclusion(c.url))
      );
      if (deeperCandidates.length > 0) {
        evidence.push({
          category: "fallback-candidate",
          snippet: `${topCandidate.title} — matched "${topCandidate.matchedTerm}" in a link on the official homepage; this page looks like a gateway/index, not the substantive policy text itself.`,
          url: topCandidate.url,
        });
        evidence.push(buildSubstantiveCandidateEvidence(deeperCandidates[0], topCandidate));
        exploredDeeper = true;
      }
    }
  }

  if (!exploredDeeper) {
    // Either the top candidate already looks substantive on its own,
    // the gateway hop couldn't be verified (fetch failure or an
    // off-domain redirect), or nothing further was found on it — fall
    // back to presenting it exactly as a plain, unverified same-domain
    // candidate link, same as before this feature existed.
    evidence.push(buildFallbackCandidateEvidence(topCandidate));
  }

  for (const c of restCandidates) evidence.push(buildFallbackCandidateEvidence(c));

  return evidence;
}

export async function checkPulseSourcePolicy(
  id: string,
  sanity: PolicyCheckSanityClient = client,
  fetchPolicyText: (url: string) => Promise<Awaited<ReturnType<typeof safeFetchText>>> = safeFetchText
): Promise<PulsePolicyCheckResult> {
  // Re-read termsUrl fresh from Sanity on every call, never accepted as
  // a caller-supplied parameter — this is what guarantees provenance:
  // policyCheckedUrl always reflects whatever termsUrl genuinely was AT
  // THE MOMENT of this specific check, so a later edit to termsUrl can
  // never retroactively relabel earlier evidence, and this check can
  // never be tricked into recording a URL it didn't actually fetch.
  const source = await sanity.fetch<{ termsUrl: string | null; sourceClassification: "official_primary" | "editorial_discovery" | null; url: string | null } | null>(
    POLICY_CHECK_SOURCE_QUERY,
    { id }
  );
  if (!source) return { ok: false, error: "Source not found." };
  if (!source.termsUrl) return { ok: false, error: "No Policy/Rights URL is configured — add one and Save before checking." };

  const checkedUrl = source.termsUrl;
  const checkedAt = new Date().toISOString();
  const fetchResult = await fetchPolicyText(checkedUrl);

  let recommendation: PulsePolicyCheckRecommendation;
  let evidence: PolicyEvidenceItem[];
  if (!fetchResult.ok) {
    // Missing/inaccessible/timeout/403/404/unsupported content, and an
    // unsafe (SSRF-blocked) destination, are all treated the same way —
    // inconclusive, never a silent skip and never a nudge toward
    // Green. The specific reason is preserved as evidence so the Admin
    // can see exactly what happened. The official-domain fallback (if
    // the source has a Website configured) runs here and can ADD
    // candidate evidence, but can never change the recommendation away
    // from inconclusive.
    recommendation = "inconclusive";
    evidence = await runOfficialDomainFallback(source.url, checkedUrl, fetchResult.reason, fetchPolicyText);
  } else {
    const evaluation = evaluatePolicyText(fetchResult.text);
    recommendation = evaluation.recommendation;
    evidence = evaluation.evidence;
  }

  const trustSuggestion = buildPolicyCheckTrustSuggestion(source.sourceClassification);

  await sanity
    .patch(id)
    .set(buildPolicyCheckPatch({ checkedAt, checkedUrl, recommendation, evidence, trustSuggestion }))
    .commit();

  return { ok: true, recommendation, evidence, checkedAt, checkedUrl, trustSuggestion };
}

// --- Rights Intelligence: "Use this policy URL" (adopt a fallback
// candidate) (2026-09-08) -------------------------------------------
// The ONLY code path that can change termsUrl as a result of the Check
// Policy workflow — and even this one only ever runs on an explicit,
// separate Admin action (never automatically from checkPulseSourcePolicy
// itself). Structurally isolated: this function's only possible write
// is `.set({ termsUrl })` — a single-key object literal, not built from
// buildPolicyCheckPatch() and sharing none of its fields — so it cannot
// touch policyChecked*/evidence, and (like checkPulseSourcePolicy) it
// cannot touch permissionClassification/isActive/imageUsePermitted/
// commercialUsePermitted/autoPublishEligible/editorialTrustLevel/
// attributionRequirement/lastPolicyReviewDate.
//
// Never trusts that a candidate is still safe merely because it was
// previously displayed to the Admin (candidates are evaluated once, at
// discovery time, against whatever the homepage looked like then) —
// re-validates the FULL safety chain (syntax, SSRF/DNS, credentials,
// same-official-domain) again, independently, right before writing.
export async function adoptPulseSourcePolicyCandidate(
  id: string,
  candidateUrl: string,
  sanity: PolicyCheckSanityClient = client,
  // Injectable purely for deterministic, DNS-free tests (same
  // established pattern as checkPulseSourcePolicy's `fetchPolicyText`
  // param) — every real call site omits this and gets the real
  // isSafeFetchTarget(), which performs an actual DNS lookup.
  checkSafety: (url: string) => ReturnType<typeof isSafeFetchTarget> = isSafeFetchTarget
): Promise<{ ok: true } | { ok: false; error: string }> {
  const source = await sanity.fetch<{ url: string | null } | null>(`*[_type == "pulseSource" && _id == $id][0]{url}`, { id });
  if (!source) return { ok: false, error: "Source not found." };
  if (!source.url) return { ok: false, error: "This source has no Website configured to validate the candidate against." };

  const officialDomain = deriveOfficialDomain(source.url);
  if (!officialDomain) return { ok: false, error: "This source's Website isn't a valid URL — fix it before adopting a candidate." };

  let parsed: URL;
  try {
    parsed = new URL(candidateUrl);
  } catch {
    return { ok: false, error: "Malformed candidate URL." };
  }
  if (parsed.username || parsed.password) return { ok: false, error: "Rejected — the candidate URL contains credentials." };
  if (!isSameOrSubdomain(parsed.hostname, officialDomain)) {
    return { ok: false, error: "Rejected — this URL is outside the source's official domain." };
  }
  const safety = await checkSafety(candidateUrl);
  if (!safety.safe) return { ok: false, error: `Rejected — ${safety.reason}.` };

  await sanity.patch(id).set({ termsUrl: candidateUrl }).commit();
  return { ok: true };
}
