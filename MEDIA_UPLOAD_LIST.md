# Ordift Studios — Media Upload Shot List

**Prepared:** 2026-07-27, from a full inventory of every image/video area in the live codebase (not a guess — every row below was confirmed against the actual page template and, where one exists, the Sanity CMS schema field it binds to).

**No stock imagery has been or will be inserted anywhere.** Every area below is currently either empty or a solid-color placeholder, waiting for real Ordift Studios photographs, films, and logo assets.

## How to read this list

Two genuinely different situations show up below, and the **Status** column tells you which:

- **✅ Ready — CMS field exists.** Upload directly into Sanity Studio and it's schema-ready today. *(Note: a few of these need one small follow-up code change — swapping a placeholder box for the real image render — before they'll actually **appear** on the live site. Flagged individually.)*
- **🔧 Needs code first.** No CMS field exists yet for this area at all (Home, About, and every Services/department page). Sending a photo for these won't make it appear until a schema change is built. Listed anyway so you know what to start planning/shooting for.

---

## Home (`/`)

| Section | Type | Orientation | Aspect / Dimensions | Format | Suggested subject | Mandatory? |
|---|---|---|---|---|---|---|
| Hero background | Single image or video | Landscape | Ultra-wide, e.g. 21:9 or 16:9, min. 2400×1350px | JPG/PNG (photo) or MP4 H.264 (video) | Signature studio/shoot moment that captures "photography, film, design, branding, content and talent as one system" | 🔧 Needs code first |
| Department grid thumbnails (4 cards: Photography, Videography, Design, Branding) | 4 images, one per department | Landscape | 4:3, min. 1200×900px | JPG/PNG | One representative shot per department/discipline | 🔧 Needs code first |

## About (`/about`)

| Section | Type | Orientation | Aspect / Dimensions | Format | Suggested subject | Mandatory? |
|---|---|---|---|---|---|---|
| Entire page (hero, Story, Mission/Vision, Values) | — | — | — | — | — | 🔧 Needs code first — no image field exists anywhere on this page |

## Founder (`/about/founder`)

| Section | Type | Orientation | Aspect / Dimensions | Format | Suggested subject | Mandatory? |
|---|---|---|---|---|---|---|
| Founder portrait | Single image | Portrait | 4:5, min. 1200×1500px | JPG/PNG | Professional portrait of Myredlive Anim-Tetey | ✅ Ready — CMS field exists (`founder.photo`), needs one small render fix to appear |

## Services hub (`/services`) & 7 department pages

| Section | Type | Orientation | Aspect / Dimensions | Format | Suggested subject | Mandatory? |
|---|---|---|---|---|---|---|
| Department cards on hub page | Same 4 images as Home's department grid | Landscape | 4:3, min. 1200×900px | JPG/PNG | Same as Home | 🔧 Needs code first |
| Photography / Videography / Graphic Design / Branding & Strategy / Content Creation / Talent Management / Production — hero + any gallery per page | — | — | — | — | — | 🔧 **Biggest gap on the site** — none of the 7 department pages has any media capability at all, not even a placeholder. If you want hero imagery or a mini-portfolio strip per department (recommended, especially for Photography/Videography), this needs a schema change before anything can go here. |

## Work / Portfolio (`/work`)

| Section | Type | Orientation | Aspect / Dimensions | Format | Suggested subject | Mandatory? |
|---|---|---|---|---|---|---|
| Project card thumbnail (listing grid) | 1 per project | Landscape | 4:3, min. 1200×900px | JPG/PNG (or first-frame still if video) | Best single shot representing the project | ✅ Ready — CMS field exists (`heroMedia`), needs render fix to appear |
| Project detail — Hero banner | 1 per project, image or video | Landscape | Ultra-wide 21:9, min. 2400×1030px | JPG/PNG or MP4 | Lead image/video for the project | ✅ Ready — CMS field exists (`heroMedia`), needs render fix |
| Project detail — Final Gallery | Multiple per project | Square | 1:1, min. 1500×1500px each | JPG/PNG | Final delivered images | ✅ Ready — CMS field exists (`gallery`), needs render fix |
| Project detail — Videos | Multiple per project | Landscape | 16:9, min. 1920×1080px | MP4 (H.264) | Final films/edits | ✅ Ready — CMS field exists (`videos`), needs render fix |
| Project detail — Behind the Scenes gallery | Multiple per project | Square | 1:1, min. 1500×1500px each | JPG/PNG | On-set/process shots | ✅ Ready — CMS field exists (`behindTheScenesGallery`), needs render fix |
| Project detail — Before & After pairs | Paired images per project | Square | 1:1 each, matched crop between the pair | JPG/PNG | Retouching/edit comparisons | ✅ Ready — CMS field exists (`beforeAfterGallery`), needs render fix |

*Optional, per project as available.*

## Journal / Stories (`/journal`)

| Section | Type | Orientation | Aspect / Dimensions | Format | Suggested subject | Mandatory? |
|---|---|---|---|---|---|---|
| Post card thumbnail (listing grid) | 1 per post | Landscape | 16:10, min. 1600×1000px | JPG/PNG | Representative image for the story | ✅ Ready — CMS field exists (`heroImage`, required), needs render fix |
| Post detail — Hero banner | 1 per post | Landscape | Ultra-wide 21:9, min. 2400×1030px | JPG/PNG | Same lead image, larger | ✅ Ready — CMS field exists (`heroImage`), needs render fix |
| Post detail — Video article embed | 1 per video-format post | Landscape | 16:9 | **A hosted URL (YouTube/Vimeo), not a file upload** | — | ✅ Field exists (`videoUrl`) but the embed itself isn't wired up yet — needs code, not just a URL |
| Author byline avatar | 1 per author | Square | 1:1, min. 400×400px | JPG/PNG | Author headshot | ✅ Ready — CMS field exists (`author.photo`), needs render fix |

## Workshops / Academy (`/workshops`)

| Section | Type | Orientation | Aspect / Dimensions | Format | Suggested subject | Mandatory? |
|---|---|---|---|---|---|---|
| Workshop card thumbnail (listing grid) | 1 per workshop | Landscape | — | — | — | 🔧 Needs code first — no schema field exists at all, not even a placeholder |
| Workshop detail — hero banner | 1 per workshop | — | — | — | — | 🔧 Needs code first — unlike Work/Journal, this template has no hero placeholder at all |
| Instructor avatar | 1 per instructor | Square | 1:1, min. 400×400px | JPG/PNG | Instructor headshot | ✅ Ready — CMS field exists (`instructor.photo`), needs render fix |
| Workshop detail — Gallery | Multiple per workshop | Square | 1:1, min. 1500×1500px each | JPG/PNG | Past workshop moments | ✅ Ready — CMS field exists (`workshop.gallery`), needs render fix |

## Logo / Brand Assets

| Item | Status |
|---|---|
| Current logo files (`public/brand/`: full/nav/icon variants × black/white/gold) | Already in place and in active use site-wide — **no new upload needed** for these to keep working. |
| Vector source (SVG/AI/EPS/PDF) | **Optional but valuable**: the current files are a provisional crop from a single raster source (flagged in code as pending final sign-off). If a true vector original exists, sending it would let every logo variant be redone cleanly instead of raster-cropped. |

---

## Priority recommendation

If you want to send assets in stages rather than all at once, this order gets the most visible impact fastest, ranked by what's both high-traffic **and** already technically ready to display the moment it's uploaded:

1. **Portfolio project media** (hero, gallery, videos, BTS, before/after) — the richest showcase on the site, schema-ready, and the most natural first thing a visitor wants to see.
2. **Journal hero images + author avatars** — same "ready, just needs upload" status.
3. **Founder portrait** — one image, high visibility on the About section.
4. **Workshop instructor avatars + galleries** — same pattern, lower traffic than Portfolio/Journal.
5. Everything marked 🔧 **Needs code first** (Home hero, department thumbnails, Services/department pages, Workshop thumbnails/hero) — feel free to start shooting/selecting for these in parallel, but they won't go live until the corresponding schema fields are built.

---

*This list is derived from the codebase as of 2026-07-27. If department/Home/Workshop hero fields get built later, this document should be updated to move those rows from 🔧 to ✅.*
