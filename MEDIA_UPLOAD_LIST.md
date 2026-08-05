# Ordift Studios — Media Requirement List

**Prepared:** 2026-07-27, from a full inventory of every image/video area in the live codebase (not a guess — every row below was confirmed against the actual page template and, where one exists, the Sanity CMS schema field it binds to).

**Updated:** 2026-07-27 (LC1 Phase 3/5) — every area on the site now degrades gracefully instead of showing a broken image or flat gray box: fields with a real Sanity asset render it; fields that exist but are empty, and areas with no CMS field at all yet, show a branded placeholder (the Ordift monogram on a soft navy/off-white glow, see `MEDIA_ARCHITECTURE.md`). **No area on the site currently displays stock imagery, and none ever will** — every placeholder below is waiting specifically for real Ordift Studios photography, film, and brand assets.

## How to read this list

Three genuinely different situations show up below, and the **Status** column tells you which:

- **✅ Ready — CMS field exists.** Upload directly into Sanity Studio and it replaces the placeholder immediately — no further code changes needed.
- **🎨 Placeholder in place, CMS field not yet built.** The area now looks intentional (branded placeholder, not a broken box), but there's nowhere to upload a replacement yet — a small, additive schema change is needed first. Per the current architecture freeze (see `MILESTONES.md`), these are deliberately **not** being built this phase; flagged here so shooting/selecting can start in parallel and the schema work is a quick follow-up once you're ready.
- **📋 Not yet inventoried for CMS wiring.** A CMS field exists but nothing on the site currently reads it into a page — a wiring gap, not a shooting gap.

---

## Home (`/`)

| Section | Type | Orientation | Aspect / Dimensions | Format | Suggested subject | Status |
|---|---|---|---|---|---|---|
| Hero visual | Single image or video | Portrait | 4:5, min. 1600×2000px | JPG/PNG (photo) or MP4 H.264 (video) | Signature studio/shoot moment that captures "photography, film, design, branding, content and talent as one system" | ✅ Ready — schema field exists (`homepage.heroImage`) and renders; currently borrowing the first Featured portfolio project's hero image as a real interim visual (2026-08-05) until a dedicated campaign shot is set |
| Department grid thumbnails (4 cards: Photography, Videography, Design, Branding) | 4 images, one per department | Landscape | 4:3, min. 1200×900px | JPG/PNG | One representative shot per department/discipline | 🎨 Placeholder in place |

## About (`/about`)

| Section | Type | Orientation | Aspect / Dimensions | Format | Suggested subject | Status |
|---|---|---|---|---|---|---|
| Entire page (hero, Story, Mission/Vision, Values) | — | — | — | — | — | 🔧 No image field or placeholder exists anywhere on this page yet — lowest-traffic gap on the site, since About currently reads as a text-forward brand statement page by design |

## Founder (`/about/founder`)

| Section | Type | Orientation | Aspect / Dimensions | Format | Suggested subject | Status |
|---|---|---|---|---|---|---|
| Founder portrait | Single image | Portrait | 4:5, min. 1200×1500px | JPG/PNG | Professional portrait of Myredlive Anim-Tetey | ✅ Ready — CMS field exists (`founder.photo`) and renders |

## Services hub (`/services`) & 7 department pages

| Section | Type | Orientation | Aspect / Dimensions | Format | Suggested subject | Status |
|---|---|---|---|---|---|---|
| Department cards on hub page | Same 4 images as Home's department grid | Landscape | 4:3, min. 1200×900px | JPG/PNG | Same as Home | 🎨 Placeholder in place |
| Department hero visual (all 7: Photography, Videography, Graphic Design, Branding & Strategy, Content Creation, Talent Management, Production) | 1 per department | Portrait | 4:5, min. 1600×2000px | JPG/PNG or MP4 | Signature shot for that discipline | 🎨 Placeholder in place |
| Department "Featured Work" strip (all except Talent Management) | 3 images per department | Landscape/Square | 4:3, min. 1200×900px | JPG/PNG | 3 best representative shots for that discipline — ideally distinct from the hero visual | 🎨 Placeholder in place (3 tiles) |

*Departments are the single biggest visual opportunity on the site once real photography exists — a visitor lands on `/services/photography` specifically to see photography.*

## Work / Portfolio (`/work`)

| Section | Type | Orientation | Aspect / Dimensions | Format | Suggested subject | Status |
|---|---|---|---|---|---|---|
| Project card thumbnail (listing grid) | 1 per project | Landscape | 4:3, min. 1200×900px | JPG/PNG (or first-frame still if video) | Best single shot representing the project | ✅ Ready — CMS field exists (`heroMedia`) and renders |
| Project detail — Hero banner | 1 per project, image or video | Landscape | Ultra-wide 21:9, min. 2400×1030px | JPG/PNG or MP4 | Lead image/video for the project | ✅ Ready — CMS field exists (`heroMedia`) and renders |
| Project detail — Final Gallery | Multiple per project | Square | 1:1, min. 1500×1500px each | JPG/PNG | Final delivered images | ✅ Ready — CMS field exists (`gallery`) and renders |
| Project detail — Videos | Multiple per project | Landscape | 16:9, min. 1920×1080px | MP4 (H.264) | Final films/edits | ✅ Ready — CMS field exists (`videos`) and renders |
| Project detail — Behind the Scenes gallery | Multiple per project | Square | 1:1, min. 1500×1500px each | JPG/PNG | On-set/process shots | ✅ Ready — CMS field exists (`behindTheScenesGallery`) and renders |
| Project detail — Before & After pairs | Paired images per project | Square | 1:1 each, matched crop between the pair | JPG/PNG | Retouching/edit comparisons | ✅ Ready — CMS field exists (`beforeAfterGallery`) and renders |

*Optional per project, except hero media which is required.*

## Journal / Stories (`/journal`) — also serves Ordift Pulse content

| Section | Type | Orientation | Aspect / Dimensions | Format | Suggested subject | Status |
|---|---|---|---|---|---|---|
| Post card thumbnail (listing grid) | 1 per post | Landscape | 16:10, min. 1600×1000px | JPG/PNG | Representative image for the story | ✅ Ready — CMS field exists (`heroImage`, required) and renders |
| Post detail — Hero banner | 1 per post | Landscape | Ultra-wide 21:9, min. 2400×1030px | JPG/PNG | Same lead image, larger | ✅ Ready — CMS field exists (`heroImage`) and renders |
| Post detail — Video article embed | 1 per video-format post | Landscape | 16:9 | **A hosted URL (YouTube/Vimeo), not a file upload** | — | ✅ Ready — CMS field exists (`videoUrl`) and the embed renders |
| Author byline avatar | 1 per author | Square | 1:1, min. 400×400px | JPG/PNG | Author headshot | ✅ Ready — CMS field exists (`author.photo`) and renders |
| Pulse article hero (Editorial/Creative News/Industry Updates/Opportunities/Upcoming Events) | 1 per article/listing | Landscape | Ultra-wide 21:9, min. 2400×1030px | JPG/PNG | For editorial: a relevant Ordift shot. For curated/community content, use only imagery you have the rights to publish (the source's own press image, or a licensed/attributed photo) — never scrape or reuse without permission | ✅ Ready — CMS field exists (`pulseArticle.heroMedia`) and renders |

## Workshops / Academy (`/workshops`)

| Section | Type | Orientation | Aspect / Dimensions | Format | Suggested subject | Status |
|---|---|---|---|---|---|---|
| Workshop card thumbnail (listing grid) | 1 per workshop | Landscape | 4:3, min. 1200×900px | JPG/PNG | Representative shot for the workshop | 🔧 No image field exists on `Workshop` yet — not even a placeholder |
| Workshop detail — hero banner | 1 per workshop | Landscape | Ultra-wide 21:9, min. 2400×1030px | JPG/PNG or MP4 | Lead image/video for the workshop | 🔧 No image field exists on `Workshop` yet — not even a placeholder |
| Instructor avatar | 1 per instructor | Square | 1:1, min. 400×400px | JPG/PNG | Instructor headshot | ✅ Ready — CMS field exists (`instructor.photo`) and renders |
| Workshop detail — Gallery | Multiple per workshop | Square | 1:1, min. 1500×1500px each | JPG/PNG | Past workshop moments | ✅ Ready — CMS field exists (`workshop.gallery`) and renders |

*Workshop card/hero are the one area on the site that still shows no placeholder at all, not even the branded one — they were out of scope for this pass since, unlike Home/Departments, adding a hero/thumbnail field to `Workshop` is itself a schema change, which the current architecture freeze defers. Flagged as the top follow-up once a content-driven stage resumes.*

## Logo, Brand & Promotional Assets

| Item | Status |
|---|---|
| Current logo files (`public/brand/`: full/nav/icon variants × black/white/gold) | Already in place and in active use site-wide — **no new upload needed** for these to keep working. |
| Vector source (SVG/AI/EPS/PDF) | **Optional but valuable**: the current files are a provisional crop from a single raster source (flagged in code as pending final sign-off). If a true vector original exists, sending it would let every logo variant be redone cleanly instead of raster-cropped, and would also let the `MediaPlaceholder` component's monogram mark use a crisper source. |
| Favicon | Already in place (`/favicon.ico`) — no action needed unless you want it refreshed alongside a new vector logo. |
| Site-wide default social-share (Open Graph) image | 📋 **Wiring gap, not a shooting gap** — `siteSettings.defaultSeo.ogImage` already exists as a CMS field, but nothing in the site's root metadata currently reads it as a fallback for pages that don't set their own OG image (Home, About, Services hub, and any static page). Recommend this as a quick follow-up fix (reads an existing field, no schema change) before real content population, so every page has a decent social-share image the moment one is uploaded. Recommended: 1200×630px, JPG/PNG. |
| Branded email header/logo (Resend transactional emails) | Already wired to the existing logo assets — no new upload needed. |

---

## Priority recommendation

If you want to send assets in stages rather than all at once, this order gets the most visible impact fastest, ranked by what's both high-traffic **and** already technically ready to display the moment it's uploaded:

1. **Portfolio project media** (hero, gallery, videos, BTS, before/after) — the richest showcase on the site, schema-ready, and the most natural first thing a visitor wants to see. Within Portfolio, lead with 1–2 `featured` projects spanning different disciplines (not all-Photography) so the `/work` hub's Featured section immediately signals the full multidisciplinary range, before filling in the rest of the grid.
2. **Journal hero images + author avatars** — same "ready, just needs upload" status.
3. **Founder portrait** — one image, high visibility on the About section.
4. **Workshop instructor avatars + galleries** — same pattern, lower traffic than Portfolio/Journal.
5. **Department hero visuals + Featured Work strips** (once the schema follow-up lands) — these are now the highest-leverage 🎨 rows: every visitor who clicks into a specific discipline page currently sees a beautiful placeholder instead of real work, and departments are a deliberate, high-intent click (a visitor chose "Photography," not just "Work").
6. **Home hero + department grid thumbnails** (once the schema follow-up lands) — same reasoning as #5, but the homepage sees the most total traffic.
7. Everything marked 🔧 (Workshop card/hero fields, the entire About page) — feel free to start shooting/selecting for these in parallel, but they won't go live until the corresponding schema field is built in a future stage.

---

*This list is derived from the codebase as of 2026-07-27. Every 🎨 row reflects `MediaPlaceholder`/`MEDIA_ARCHITECTURE.md`'s empty-state work — a visual improvement only; the underlying CMS-field gap for those rows is unchanged and deliberately deferred by the current architecture freeze (see `MILESTONES.md`). If those fields get built later, update this document to move the affected rows from 🎨 to ✅.*
