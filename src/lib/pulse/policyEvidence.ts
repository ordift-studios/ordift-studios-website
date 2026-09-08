// Ordift Pulse — Rights-Intelligence "Check Policy" workflow (2026-09-08).
// Pure, zero-import evidence/recommendation logic — no DB, no network,
// no AI/LLM provider. Deliberately rules-based, same philosophy as the
// existing exclusionFilter.ts ("Rules-based only — no AI/paid provider
// required, per explicit direction"). This module answers one narrow
// question — "what does the text of a policy page suggest, in plain
// contextual language" — and NEVER decides a source's actual rights
// status. See checkPulseSourcePolicy() (pulseAdmin.ts) for the only
// caller, and SourceEditForm.tsx/PolicyCheckPanel.tsx for how the
// output is presented to a human as a non-binding suggestion.

export type PulsePolicyCheckRecommendation = "candidate-green" | "candidate-red" | "inconclusive";

// Distinguishes WHAT KIND of material a matched phrase is talking
// about — approved direction (2026-09-08): "where the page distinguishes
// between website text, press materials, downloadable media, trademarks,
// photographs, third-party assets, etc., the checker should surface that
// distinction rather than collapse everything into one recommendation."
export type PolicyEvidenceCategory =
  | "press-materials"
  | "photographs"
  | "trademarks"
  | "third-party"
  | "website-general"
  | "fetch-error"
  | "safety-block"
  | "unsupported-content"
  // Official-Domain Policy Discovery Fallback (2026-09-08) — an item in
  // this category always carries `url`: a same-official-domain page
  // found on the source's own homepage whose link text/path suggests a
  // policy/legal/press page. Never itself a recommendation signal —
  // evaluatePolicyText() never produces this category; only the
  // fallback path in checkPulseSourcePolicy() does.
  | "fallback-candidate";

export type PolicyEvidenceItem = {
  category: PolicyEvidenceCategory;
  // Short, bounded snippet (~200 chars) with just enough surrounding
  // context to see WHY it matched — never a reproduction of the policy
  // page, never a substantial excerpt of copyrighted text.
  snippet: string;
  // Official-Domain Policy Discovery Fallback (2026-09-08) — set ONLY
  // for category "fallback-candidate": the exact same-official-domain
  // URL the Admin can choose to adopt via "Use this policy URL".
  // Undefined for every other category, including on every pre-existing
  // evidence item (backward compatible — see the schema change note in
  // pulseSource.ts).
  url?: string;
};

export type PolicyEvaluation = {
  recommendation: PulsePolicyCheckRecommendation;
  evidence: PolicyEvidenceItem[];
};

const MAX_EVIDENCE_ITEMS = 5;
const SNIPPET_CONTEXT_CHARS = 90; // chars of context on EACH side of a match

// --- Asset-context vocabulary ---------------------------------------
// A permission verb alone is deliberately NEVER sufficient for
// candidate-green (2026-09-08 direction: "a single isolated keyword
// such as 'royalty-free', 'media', 'press', 'editorial use' or
// 'attribution' must not be enough"). candidate-green requires a
// permission-verb phrase to co-occur, in the same nearby window, with
// one of these asset-context terms — otherwise it reads as generic
// website Terms-of-Use boilerplate, not a real grant to reuse
// newsroom/media assets, and is skipped entirely rather than counted as
// weak evidence.
const ASSET_CONTEXT_TERMS: { term: RegExp; category: PolicyEvidenceCategory }[] = [
  { term: /press (material|image|photo|kit|release)/i, category: "press-materials" },
  { term: /newsroom/i, category: "press-materials" },
  { term: /media (asset|kit)/i, category: "press-materials" },
  { term: /editorial use/i, category: "press-materials" },
  { term: /photograph/i, category: "photographs" },
  { term: /\bimage(s)?\b/i, category: "photographs" },
  { term: /trademark/i, category: "trademarks" },
  { term: /\blogo(s)?\b/i, category: "trademarks" },
  { term: /brand mark/i, category: "trademarks" },
  { term: /third[- ]party/i, category: "third-party" },
  { term: /licensor/i, category: "third-party" },
];

// --- Contextual permission-verb phrases ------------------------------
// Every entry is itself already a multi-word phrase (never a single
// keyword) expressing an actual grant of permission — not just the
// presence of a topic word.
const PERMISSIVE_PHRASES: RegExp[] = [
  /may be (used|reproduced|downloaded|published)/i,
  /(are|is) permitted to (use|reproduce|publish|download)/i,
  /no prior (permission|approval|consent|written permission) (is )?(required|needed)/i,
  /without prior (permission|approval|written consent)\s+(is\s+)?(required|needed)/i,
  /free to use/i,
  /granted (a |permission to )?(royalty-free|non-exclusive) licen[cs]e/i,
  /hereby grants? (you |media )?(a |permission )?(to use|license)/i,
  /authorized to use/i,
  /available for (use|download) by (media|press|journalists)/i,
];

// --- Contextual restriction phrases -----------------------------------
// Each of these is already unambiguous on its own — no co-occurring
// asset-context term is required to count (being cautious toward
// candidate-red carries far less risk than being cautious toward
// candidate-green), though nearby asset-context words are still used to
// tag the category for display.
const RESTRICTIVE_PHRASES: RegExp[] = [
  /all rights reserved/i,
  /may not be (reproduced|used|copied|distributed|republished)/i,
  // "without prior written consent/permission" is only restrictive when
  // it follows an actual prohibition cue nearby (e.g. "may not ...
  // without prior written consent") — on its own it's genuinely
  // ambiguous, since the exact same phrase also appears in permissive
  // constructions ("may be used ... without prior written permission",
  // i.e. no need to ask). Requiring the negative modal within a short
  // window avoids misreading the permissive form as restrictive.
  /(may not|cannot|must not|shall not|is prohibited)[^.]{0,60}without (our |the publisher's )?prior written (consent|permission)/i,
  /strictly prohibited/i,
  /not permitted without/i,
  /reserves? all rights/i,
  /no licen[cs]e is granted/i,
  /unauthorized use is prohibited/i,
  /protected by copyright/i,
];

function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSnippet(text: string, matchIndex: number, matchLength: number): string {
  const start = Math.max(0, matchIndex - SNIPPET_CONTEXT_CHARS);
  const end = Math.min(text.length, matchIndex + matchLength + SNIPPET_CONTEXT_CHARS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function nearbyAssetCategory(text: string, matchIndex: number, matchLength: number): PolicyEvidenceCategory | null {
  const windowStart = Math.max(0, matchIndex - 150);
  const windowEnd = Math.min(text.length, matchIndex + matchLength + 150);
  const window = text.slice(windowStart, windowEnd);
  for (const { term, category } of ASSET_CONTEXT_TERMS) {
    if (term.test(window)) return category;
  }
  return null;
}

function dedupeEvidence(items: PolicyEvidenceItem[]): PolicyEvidenceItem[] {
  const seen = new Set<string>();
  const out: PolicyEvidenceItem[] = [];
  for (const item of items) {
    const key = `${item.category}:${item.snippet}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= MAX_EVIDENCE_ITEMS) break;
  }
  return out;
}

// Core, pure evaluator. Deterministic — the same input text always
// produces the same output. Never throws.
export function evaluatePolicyText(rawText: string): PolicyEvaluation {
  const text = stripHtml(rawText);

  const permissiveEvidence: PolicyEvidenceItem[] = [];
  for (const phrase of PERMISSIVE_PHRASES) {
    const match = phrase.exec(text);
    if (!match || match.index === undefined) continue;
    // Requirement: a permission verb alone is never sufficient — it
    // must co-occur with a real asset-context term nearby, or it's
    // skipped entirely (treated as generic site-wide language, not
    // evidence about newsroom/media assets).
    const category = nearbyAssetCategory(text, match.index, match[0].length);
    if (!category) continue;
    permissiveEvidence.push({ category, snippet: extractSnippet(text, match.index, match[0].length) });
  }

  const restrictiveEvidence: PolicyEvidenceItem[] = [];
  for (const phrase of RESTRICTIVE_PHRASES) {
    const match = phrase.exec(text);
    if (!match || match.index === undefined) continue;
    const category = nearbyAssetCategory(text, match.index, match[0].length) ?? "website-general";
    restrictiveEvidence.push({ category, snippet: extractSnippet(text, match.index, match[0].length) });
  }

  const hasPermissive = permissiveEvidence.length > 0;
  const hasRestrictive = restrictiveEvidence.length > 0;

  // Conflict rule (2026-09-08, explicit): if both signals appear,
  // recommendation is ALWAYS inconclusive — never candidate-green, even
  // if permissive evidence looks strong.
  if (hasPermissive && hasRestrictive) {
    return { recommendation: "inconclusive", evidence: dedupeEvidence([...permissiveEvidence, ...restrictiveEvidence]) };
  }
  if (hasPermissive) {
    return { recommendation: "candidate-green", evidence: dedupeEvidence(permissiveEvidence) };
  }
  if (hasRestrictive) {
    return { recommendation: "candidate-red", evidence: dedupeEvidence(restrictiveEvidence) };
  }
  return {
    recommendation: "inconclusive",
    evidence: [{ category: "website-general", snippet: "No clear permissive or restrictive language about media/press assets was found on the checked page." }],
  };
}

// --- Trust suggestion (non-binding, display-only) ---------------------
// Requirement (2026-09-08): official-domain ownership must NEVER be
// read as universally "high trust" — this is deliberately a factual,
// role-describing sentence, never a Trust Level value, and is never
// written to editorialTrustLevel by any code path.
export function buildPolicyCheckTrustSuggestion(sourceClassification: "official_primary" | "editorial_discovery" | null | undefined): string | null {
  if (sourceClassification === "official_primary") {
    return "Official primary source — authoritative for the brand's own announcements, specifications and statements; not an independent source.";
  }
  return null;
}

// --- Write-isolation guarantee -----------------------------------------
// The exact, closed set of fields the "Check Policy" action is ever
// allowed to write. Exported so a test can assert, structurally, that
// none of the six independent human-decision fields ever appear here —
// see policyEvidence.test.ts's "never writes a decision field" test.
// checkPulseSourcePolicy() (pulseAdmin.ts) builds its Sanity .set()
// patch EXCLUSIVELY via buildPolicyCheckPatch() below, so this list is
// enforced on the real write path, not just asserted in parallel.
export const POLICY_CHECK_WRITE_FIELDS = [
  "policyCheckedAt",
  "policyCheckedUrl",
  "policyCheckRecommendation",
  "policyCheckEvidence",
  "policyCheckTrustSuggestion",
] as const;

// The six independent human-decision fields this action must never
// touch (2026-09-08, explicit) — kept here, next to
// POLICY_CHECK_WRITE_FIELDS, so the two lists are easy to compare by
// eye as well as by test.
export const PULSE_SOURCE_DECISION_FIELDS = [
  "permissionClassification",
  "isActive",
  "imageUsePermitted",
  "commercialUsePermitted",
  "autoPublishEligible",
  "editorialTrustLevel",
  "attributionRequirement",
  "lastPolicyReviewDate",
] as const;

export type PolicyCheckPatchInput = {
  checkedAt: string;
  checkedUrl: string;
  recommendation: PulsePolicyCheckRecommendation;
  evidence: PolicyEvidenceItem[];
  trustSuggestion: string | null;
};

// Pure — builds the exact object passed to Sanity's .patch(id).set().
// Deliberately a plain, closed object literal (not spread from
// arbitrary input) so it can never accidentally carry an extra key.
export function buildPolicyCheckPatch(input: PolicyCheckPatchInput): Record<string, unknown> {
  return {
    policyCheckedAt: input.checkedAt,
    policyCheckedUrl: input.checkedUrl,
    policyCheckRecommendation: input.recommendation,
    policyCheckEvidence: input.evidence,
    policyCheckTrustSuggestion: input.trustSuggestion,
  };
}

// =========================================================================
// Official-Domain Policy Discovery Fallback (2026-09-08)
// =========================================================================
// Runs ONLY when the Admin-saved Policy/Rights URL itself couldn't be
// evaluated (404/timeout/unreachable/unsupported content — see
// checkPulseSourcePolicy()'s fallback branch). Fetches nothing on its
// own — this module only ever PARSES html a caller already fetched
// (the source's own homepage, via the same safeFetchText() used for
// termsUrl) and extracts same-official-domain <a href> candidates whose
// link text/path suggests a policy/legal/press page. Never a search
// engine, never a crawl, never a second hop — exactly one page's
// existing links, filtered and matched.
//
// No HTML-parsing dependency exists anywhere in this project's declared
// package.json (confirmed by inspection immediately before writing
// this — the only DOM/HTML parser packages present in node_modules at
// all, node-html-parser/jsdom/parse5, are undeclared TRANSITIVE
// dependencies of `sanity`'s own CLI tooling and of `vitest`, not
// available or appropriate for production app code to import). This is
// therefore a narrowly-scoped, defensive regex-based anchor extractor —
// not a general HTML parser — used for exactly one job: pull literal
// href/text pairs out of one already-fetched, already-safety-checked
// page.

// Grouped, multi-word-friendly keyword vocabulary — matched as
// substrings against (link text + URL path) lowercased, never against
// a single ambiguous token in isolation the way ASSET_CONTEXT_TERMS
// above deliberately also avoids. These are EXAMPLES per the approved
// direction, not an assumption that any one of them exists on every
// site.
const LEGAL_TERMS_KEYWORDS = [
  "terms of use",
  "terms & conditions",
  "terms and conditions",
  "terms",
  "legal",
  "copyright",
  "content usage",
  "content use",
  "image usage",
  "image use",
  "intellectual property",
  "licensing",
  "license",
  "brand guidelines",
  "site policy",
  "usage policy",
  "usage guidelines",
];
const PRESS_NEWSROOM_KEYWORDS = ["newsroom", "press kit", "press materials", "press release", "media kit", "press"];

export type PolicyCandidateLink = {
  url: string;
  title: string; // anchor text (or, if empty, the URL itself), bounded
  matchedTerm: string;
  category: "legal-terms" | "press-newsroom";
};

// Deliberately bounded and simple — a linear scan capped at ANCHOR_SCAN_LIMIT
// anchors, using a non-greedy match on `[^>]*` (bounded, no nested
// quantifier blowup) for attributes and on the anchor body up to the
// next `</a>`. Combined with safeFetchText()'s existing ~300KB response
// cap, this is not exploitable for catastrophic backtracking at any
// realistic policy-homepage size. Any exception during parsing is
// caught by the caller (extractPolicyCandidateLinks) and produces zero
// candidates rather than propagating — a parser failure must never
// crash the check or invent a URL.
const ANCHOR_REGEX = /<a\s+[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
const ANCHOR_SCAN_LIMIT = 500;
const MAX_HREF_LENGTH = 2000; // defensive bound against pathological attribute values

function extractAnchors(html: string): { href: string; text: string }[] {
  const anchors: { href: string; text: string }[] = [];
  const regex = new RegExp(ANCHOR_REGEX.source, ANCHOR_REGEX.flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const href = match[2];
    if (typeof href === "string" && href.length <= MAX_HREF_LENGTH) {
      anchors.push({ href, text: stripHtml(match[3] ?? "") });
    }
    if (anchors.length >= ANCHOR_SCAN_LIMIT) break;
    // A zero-length match would otherwise spin the loop forever; never
    // actually possible with this pattern (href is required), but
    // guarded anyway rather than trusted.
    if (match.index === regex.lastIndex) regex.lastIndex++;
  }
  return anchors;
}

// Only literal http(s) URLs may become a candidate — every other
// scheme (javascript:, data:, mailto:, tel:, ftp:, file:, ...) is
// rejected by this allowlist-of-one-thing check, not a maintained
// blocklist. A malformed href (new URL() throws) never becomes a
// candidate. Credentials/userinfo in the URL (`user:pass@host`) are
// rejected outright. A pure in-page fragment ("#section") is skipped
// before resolution — it can never itself be a different, useful page.
function resolveCandidateUrl(href: string, baseUrl: string): URL | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  let resolved: URL;
  try {
    resolved = new URL(trimmed, baseUrl);
  } catch {
    return null;
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
  if (resolved.username || resolved.password) return null;
  resolved.hash = ""; // fragment-only differences must not produce duplicate candidates
  return resolved;
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function hostLabels(hostname: string): string[] {
  return normalizeHostname(hostname).split(".").filter(Boolean);
}

// Rigorous, label-boundary-safe comparison — deliberately NOT
// `hostname.endsWith(officialDomain)` or even
// `hostname.endsWith("." + officialDomain)` as a bare string operation
// (both can be reasoned about correctly, but the explicit direction was
// to avoid naive suffix string matching entirely). This splits both
// hostnames into their real DNS labels and requires the official
// domain's labels to be an EXACT trailing subsequence of the
// candidate's labels — "evilnikon.com" (labels [evilnikon, com]) can
// never match official domain "nikon.com" (labels [nikon, com])
// because the label "evilnikon" is never equal to "nikon", regardless
// of the substring relationship between the two raw strings.
export function isSameOrSubdomain(candidateHostname: string, officialDomain: string): boolean {
  const candidateLabels = hostLabels(candidateHostname);
  const officialLabels = hostLabels(officialDomain);
  if (officialLabels.length === 0 || candidateLabels.length < officialLabels.length) return false;
  const tail = candidateLabels.slice(candidateLabels.length - officialLabels.length);
  return tail.join(".") === officialLabels.join(".");
}

// Derives the trust-anchor domain from the Admin-entered Website field
// — the ONE piece of official-domain trust this whole fallback is
// built on (never re-derived from anything a candidate page itself
// claims). Strips a single leading "www." label — a narrow, common
// convention, not a general public-suffix heuristic — so "nikon.com",
// "www.nikon.com", and a genuine subdomain like "press.nikon.com" are
// all correctly recognized as the same official domain family, without
// guessing at multi-part TLD structure.
export function deriveOfficialDomain(sourceUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const hostname = normalizeHostname(parsed.hostname);
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

// Pure — the only entry point into this module. `html` and `baseUrl`
// are the ALREADY-FETCHED, already-safety-checked homepage response
// (see checkPulseSourcePolicy()) — this function never performs any
// I/O of its own. Never throws: a parsing failure on malformed/unusual
// HTML produces an empty candidate list, which the caller treats
// exactly like "no candidate found" (inconclusive), never an error
// that could be mistaken for a signal.
export function extractPolicyCandidateLinks(html: string, baseUrl: string, officialDomain: string, maxCandidates = 3): PolicyCandidateLink[] {
  let anchors: { href: string; text: string }[];
  try {
    anchors = extractAnchors(html);
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const candidates: PolicyCandidateLink[] = [];

  for (const anchor of anchors) {
    const resolved = resolveCandidateUrl(anchor.href, baseUrl);
    if (!resolved) continue;
    if (!isSameOrSubdomain(resolved.hostname, officialDomain)) continue;

    const haystack = `${anchor.text} ${resolved.pathname}`.toLowerCase();
    const legalMatch = LEGAL_TERMS_KEYWORDS.find((kw) => haystack.includes(kw));
    const pressMatch = !legalMatch ? PRESS_NEWSROOM_KEYWORDS.find((kw) => haystack.includes(kw)) : undefined;
    const matchedTerm = legalMatch ?? pressMatch;
    if (!matchedTerm) continue;

    const canonical = resolved.toString();
    if (seen.has(canonical)) continue;
    seen.add(canonical);

    candidates.push({
      url: canonical,
      title: (anchor.text.trim() || canonical).slice(0, 120),
      matchedTerm,
      category: legalMatch ? "legal-terms" : "press-newsroom",
    });
    if (candidates.length >= maxCandidates) break;
  }

  return candidates;
}

// Pure — turns a PolicyCandidateLink into the exact evidence-item shape
// stored/rendered, so the "why it was considered a candidate" is always
// preserved alongside the URL (2026-09-08 direction, item 12).
export function buildFallbackCandidateEvidence(candidate: PolicyCandidateLink): PolicyEvidenceItem {
  const categoryLabel = candidate.category === "press-newsroom" ? "press/newsroom" : "legal/terms";
  return {
    category: "fallback-candidate",
    snippet: `${candidate.title} — matched "${candidate.matchedTerm}" (${categoryLabel}) in a link on the official homepage.`,
    url: candidate.url,
  };
}
