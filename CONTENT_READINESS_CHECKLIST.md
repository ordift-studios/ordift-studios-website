# Content Readiness Checklist

A page-by-page audit of what's real vs. placeholder, done as part of final pre-launch review (2026-07-30). Nothing here has been modified — this is a checklist for **you** to work through in Sanity Studio (`/studio`), not something to fix automatically, since it's real business content only you can supply.

## Already real, launch-ready — no action needed

- **Homepage** — real, approved copy (mission/vision statement, department summaries, process steps)
- **About page** — real, approved copy (Brand Story, Mission, Vision, Values, Founder Bio) — confirmed this pass, reads as finished, professional copy with no placeholder markers
- **Services / department pages** — real department descriptions, confirmed across this project's history

## Entirely placeholder — needs your action before launch

All three of the following content types are explicitly labeled `[SAMPLE]` and their own copy says so directly. This isn't a defect — it's how the platform was built and verified — but none of it should be visible to real visitors at launch.

### Workshops (4 sample entries)
Full field-by-field checklist already exists — see the Workshops section below, unchanged from the original audit.

### Portfolio / Work (5 sample entries: `sample-atelier-fashion-editorial`, `sample-heritage-brand-film`, `sample-artisan-market-branding`, and 2 more)

Real Sanity `portfolioProject` schema fields to fill in per project:
- [ ] Title (currently `[SAMPLE] ...`)
- [ ] Status (draft/published)
- [ ] Featured (yes/no)
- [ ] Hero media (image/video)
- [ ] Disciplines, categories, collections
- [ ] Client name (only if the client has given permission to be named — this field is optional by design)
- [ ] Year, location
- [ ] Services provided, equipment used
- [ ] Tags
- [ ] Collaborators (name + role, e.g. Photographer, Stylist, Makeup Artist)
- [ ] Project story (required), objective, creative strategy, challenges, solution
- [ ] SEO metadata

### Journal / Stories (multiple sample entries: `sample-five-lighting-setups`, `sample-behind-the-scenes-heritage-film`, `sample-a-day-in-the-studio`, and more)

Real Sanity `journalPost` schema fields to fill in per post:
- [ ] Title (currently `[SAMPLE] ...`)
- [ ] Status, featured
- [ ] Format (article/video)
- [ ] Author (must reference a real author profile — see Instructor/Author checklist below)
- [ ] Categories, tags
- [ ] Hero image
- [ ] Video URL (only if format is video)
- [ ] Excerpt (required)
- [ ] Body (required)
- [ ] Published date
- [ ] Related posts/projects/workshops (cross-links — fill in once more real content exists)
- [ ] Newsletter excerpt, if used
- [ ] SEO metadata

### Workshops (4 sample entries: `sample-portrait-lighting-workshop`, `sample-social-content-two-day-intensive`, `sample-drone-cinematography-intro`, `sample-brand-storytelling-masterclass`)

- [ ] **Title** — real workshop name, no `[SAMPLE]` prefix
- [ ] **Slug** — URL-friendly, generated from title (Sanity does this automatically, just confirm it looks right)
- [ ] **Status** — Open for Registration / Coming Soon / Completed, set correctly for each real workshop
- [ ] **Short description** — the 1–2 line summary shown on the Workshops list page
- [ ] **Description** — the full description shown on the workshop detail page
- [ ] **Categories** — real category assignment
- [ ] **Instructors** — link to a real instructor profile, not `[SAMPLE] Instructor Name`
- [ ] **Venue** — a real venue reference, replacing "Accra, Ghana (placeholder — real address pending approval)"
- [ ] **Capacity** — real maximum attendee number (drives the automatic waiting-list logic)
- [ ] **Start date / End date / Registration deadline** — real dates (deadline drives the live countdown timer)
- [ ] **Experience levels**
- [ ] **Requires payment** (yes/no)
- [ ] **Learning outcomes** — real bullet list
- [ ] **Agenda** — real time-blocked agenda items
- [ ] **Gallery** — real workshop photos
- [ ] **FAQs** — real question/answer pairs
- [ ] **Certificate** — offered (yes/no) + real description if yes
- [ ] **Testimonials, sponsors, related workshops** — if applicable
- [ ] **Recurring/online/recorded/members-only flags**
- [ ] **SEO metadata**

## Instructor / Author profiles

- [ ] Real name, title/role, photo, bio (replacing `[SAMPLE] Instructor Name` / placeholder author profiles) — shared between Workshop instructors and Journal authors where the same person is both

## Venue

- [ ] Real venue name and address (replacing the Accra placeholder), or confirm "Online" venues are correctly configured

## Pricing — not a structured field anywhere, handled manually by design

There is **no structured "price" field** on Workshops, Portfolio, or Journal — this isn't missing, it's how the system was built. The workshop detail page always shows "This workshop requires payment. Pricing and payment instructions will be confirmed with you directly" when applicable. If you want structured pricing displayed automatically instead, that's a schema change, not a content-only task.

## Not a content task — confirm separately

- **Terms** beyond the site-wide Booking Terms legal page (`/legal/booking`) would need a schema decision first.
- **Call-to-actions** are shared UI, not per-item content — nothing to edit per-project/post/workshop unless you want item-specific CTA text, which needs a schema/code change first.

## After content is real

- [ ] Confirm `/work`, `/journal`, and `/workshops` no longer show any `[SAMPLE]` entries
- [ ] Confirm each content type's interactive behavior (workshop countdown/capacity/waitlist, portfolio filtering, journal category filtering) still works correctly with real data
- [ ] Confirm SEO metadata renders correctly (view page source or a social-share preview tool) for at least one real item of each type
- [ ] Either unpublish the sample entries in Sanity, or delete them, once real content replaces them — don't leave both live simultaneously
