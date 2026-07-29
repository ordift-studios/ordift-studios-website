# Workshop Content Replacement Checklist

Every workshop currently live in Sanity is explicitly labeled `[SAMPLE]` and its own copy says so directly ("This is placeholder content for architecture review only"). This is intentional, deliberate placeholder content used to build and verify the Workshop Platform — not a defect. Nothing here has been modified as part of this audit; this is a checklist for **you** to work through in Sanity Studio (`/studio`) before launch, department by department, one real field at a time.

There are currently 4 sample workshops (`sample-portrait-lighting-workshop`, `sample-social-content-two-day-intensive`, `sample-drone-cinematography-intro`, `sample-brand-storytelling-masterclass`) plus 2 sample instructors. Either replace each with real content, or unpublish/delete the sample ones once real workshops exist — don't leave `[SAMPLE]` content live at launch.

## Per-workshop fields (from the actual Sanity `workshop` schema — every field listed here really exists, nothing invented)

- [ ] **Title** — real workshop name, no `[SAMPLE]` prefix
- [ ] **Slug** — URL-friendly, generated from title (Sanity does this automatically, just confirm it looks right)
- [ ] **Status** — Open for Registration / Coming Soon / Completed, set correctly for each real workshop
- [ ] **Short description** — the 1–2 line summary shown on the Workshops list page
- [ ] **Description** — the full description shown on the workshop detail page
- [ ] **Categories** — real category assignment (Photography Fundamentals, Videography & Filmmaking, Business of Creativity, Post-Production & Editing, or a new one you create)
- [ ] **Instructors** — link to a real instructor profile (see the separate Instructor checklist below), not `[SAMPLE] Instructor Name`
- [ ] **Venue** — a real venue reference (see Venue checklist below), replacing "Accra, Ghana (placeholder — real address pending approval)"
- [ ] **Capacity** — real maximum attendee number (drives the automatic waiting-list logic — get this right, it's not cosmetic)
- [ ] **Start date / End date** — real dates
- [ ] **Registration deadline** — real cutoff date (drives the live countdown timer on the workshop page)
- [ ] **Experience levels** — real applicable levels (Beginner/Intermediate/Advanced/All levels)
- [ ] **Requires payment** (yes/no toggle)
- [ ] **Learning outcomes** — real bullet list (currently `[SAMPLE] Understand three-point lighting setups` etc.)
- [ ] **Agenda** — real time-blocked agenda items (currently placeholder "Lighting theory" / "Live studio practice")
- [ ] **Gallery** — real workshop photos (currently likely empty or placeholder)
- [ ] **FAQs** — real question/answer pairs (currently `[SAMPLE] Do I need to bring my own camera?` etc.)
- [ ] **Certificate** — offered (yes/no) + real description if yes (currently "pending real copy")
- [ ] **Testimonials** — real past-attendee testimonials, if any exist yet
- [ ] **Sponsors** — real sponsor logos/links, if applicable
- [ ] **Related workshops** — cross-link to other real workshops once more than one exists
- [ ] **Recurring / recurrence note** — if this workshop repeats on a schedule
- [ ] **Online attendance possible** (yes/no)
- [ ] **Recorded session available** (yes/no)
- [ ] **Members only** (yes/no) — gates registration to a specific member classification
- [ ] **SEO** — title/description for search engines and social sharing (Sanity's shared `seo` object type, same as other content types)

## Pricing — not a Sanity field, handled manually by design

There is **no structured "price" field** in the workshop schema — this isn't missing, it's how the system was built: the workshop detail page always shows "This workshop requires payment. Pricing and payment instructions will be confirmed with you directly" when `requiresPayment` is true. If you want structured pricing shown automatically on the page instead of "confirmed directly," that's a schema change (a new field + page update), not a content-only task — flag it separately if you want that before launch rather than treating it as part of this checklist.

## Instructor profiles (separate Sanity document type)

- [ ] Real name (replacing `[SAMPLE] Instructor Name`)
- [ ] Real title/role (replacing `[SAMPLE] Lead Photography Instructor`)
- [ ] Real photo
- [ ] Real bio

## Venue

- [ ] Real venue name and address (replacing the Accra placeholder), or confirm "Online" venues are correctly configured for online-only workshops

## Not a content task — confirm separately

- **Terms** — if you mean workshop-specific terms beyond the site-wide Booking Terms legal page (`/legal/booking`), that would need a schema decision first (a new field, or a link to a workshop-specific terms document) — not something to fill in today without deciding the structure.
- **Call-to-actions** — the "Register" button and its copy are shared UI (`RegistrationForm.tsx`), not per-workshop content; nothing to edit per-workshop here unless you want workshop-specific CTA text, which again would be a schema/code change first.

## After content is real

- [ ] Confirm the Workshops list page (`/workshops`) no longer shows any `[SAMPLE]` entries
- [ ] Confirm each workshop's countdown timer, capacity/waiting-list behavior, and registration flow still work correctly with real data (re-run the same registration test used during CAPTCHA verification, just with real content this time)
- [ ] Confirm SEO metadata renders correctly (view page source or use a social-share preview tool) for at least one real workshop before considering this checklist complete
