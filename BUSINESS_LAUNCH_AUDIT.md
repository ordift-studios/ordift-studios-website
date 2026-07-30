# Business Launch Audit

**Date:** 2026-07-30. A full business-owner-perspective review of every publicly accessible page, done as if discovering Ordift Studios for the first time — not a code review. Method: every page below was loaded fresh (local environment, since production is intentionally behind `LAUNCH_HOLDING_PAGE`), read for content/UX/professionalism, and cross-checked against the real Sanity data (staging *and* production datasets queried directly, read-only) wherever "is this really live" mattered rather than assumed.

**The one finding that matters more than all the others combined:** all four legal pages (Privacy Notice, Website Terms, Cookie Notice, Booking Terms) are still literal unapproved draft placeholders — on **both** staging and production — and say so on the page itself ("This page is a placeholder... Nothing on this page should be relied on until it is reviewed and approved"). `FORMS_SENDING_ENABLED` was turned on earlier today, meaning the site can now collect real names, emails, phone numbers, and project details from real visitors while the page explaining what happens to that data is explicitly marked not to be trusted. This isn't a code defect — the code does exactly what it was built to do (show a draft, `noindex` it, warn the visitor) — it's a business/legal gap that existed before today and is now more urgent because forms are live. See Phase 2 below.

---

## Phase 1 — Page-by-Page Audit

### Home (`/`)
**Real, launch-ready.** Confident, specific copywriting ("Creating stories people do not just see, but remember"), clear department overview, honest "Ordift Originals" teaser that doesn't overpromise, a genuine 5-step process explainer, and working CTAs (Explore Our Work, Book a Service, Start a Project, Collaborate With Us). No grammar issues found.
- **Issue:** The hero and every department card show "Imagery coming soon" placeholder graphics — expected pre-launch, but this is the very first thing every visitor sees. See `MEDIA_UPLOAD_LIST.md` for the full shot list.

### About (`/about`) and Founder (`/about/founder`)
**Real, launch-ready.** Brand Story, Mission, Vision, Values, and Team sections all read as genuine, specific, well-written copy — no placeholder markers, no generic stock phrasing. The Founder bio is honest about scope ("As founder, he remains closely involved... while building the systems... to grow beyond one person") rather than overselling a one-person operation as something it isn't.
- **Minor wording note:** "Having studied Business at Senior High School" reads slightly like a CV line dropped into narrative prose rather than a natural bio sentence — not wrong, just a small polish opportunity, not a blocker.

### Services (`/services` hub + 7 department pages)
**Real, launch-ready copy.** Every department page (Photography, Videography, Graphic Design, Branding & Strategy, Content Creation, Talent Management, Production) has genuinely distinct, well-written positioning — e.g. Videography's "Film is photography with time added, and time is what most brand video wastes" is a strong, specific line, not filler.
- **Real issue:** every department page's "Featured Work" section pulls from the same unfinished Portfolio content, so a visitor lands on (for example) the Videography page and sees a "Featured Work" section with three cards all just labeled "VIDEOGRAPHY" with no image, no project name, no differentiation. On a page meant to build confidence in the work, this currently reads as broken rather than "coming soon."
- **Talent Management specifically handles its own gap well** — a clear "Coming Soon" state with honest copy ("Talent applications and brand bookings open once the secure systems behind them are ready. In the meantime, get in touch directly") and a real CTA, not a fake "Apply Now" button. This is the right pattern; the rest of the site should be judged against it.

### Portfolio (`/work`), Journal (`/journal`), Workshops (`/workshops`)
**100% placeholder content**, confirmed via direct data query on both datasets, not assumption. Every entry is explicitly prefixed `[SAMPLE]` in its own title, so a visitor sees the placeholder-ness immediately rather than being fooled — better than silently-fake content, but three entire sections of primary navigation currently lead to sample data. Full field-by-field checklist for what real content needs already exists in `CONTENT_READINESS_CHECKLIST.md`; not duplicated here.

### Booking (`/book`)
**Functionally solid, well-designed 5-step flow.** Step 1 (service selection) and Step 2 (project details) both read clearly, with sensible optional/required field splits. The "Prefer to reach us directly?" fallback contact line is a good pattern — gives a visitor an escape hatch if the form feels like too much.
- **Real issue:** that fallback line displays `ordift.ghana@gmail.com` — confirmed via direct Sanity query this is the actual configured production contact email, not a placeholder. A personal Gmail address undercuts the "premium creative house" positioning the rest of the copy works hard to establish. Worth a business decision: is a branded `@ordiftstudios.com` address available and preferred?
- **Real issue:** the WhatsApp number shown is `+44 7777371023` — a UK number. This may be entirely correct (if the founder currently operates from the UK) or may need updating to a Ghana number — I have no way to know which from the data alone, so this is flagged for your confirmation, not assumed wrong.

### Contact
There's no separate `/contact` page — "Contact" in navigation routes to `/book?service=general`, which is a reasonable, common pattern (one unified intake form rather than a separate contact form). Not an issue, just noting it so it's not mistaken for a missing page.

### Client Portal (`/portal/login`, `/portal/signup`, `/portal/forgot-password`)
Clean, professional, on-brand — same design system as the public site, working Turnstile widget (observed a real "Success!" pass during this session), clear "Create an account" and "Forgot password?" links. No issues found.

### Legal Pages (`/legal/privacy`, `/legal/terms`, `/legal/cookies`, `/legal/booking`)
**Critical finding — see the top of this document.** All four are unapproved drafts, confirmed live on production via direct read-only query:

| Page | `isApproved` (production) |
|---|---|
| Privacy Notice | `false` |
| Website Terms | `false` |
| Cookie Notice | `false` |
| Booking Terms | `false` |

Each renders a "DRAFT — NOT YET APPROVED" banner and placeholder body text ("This page is a placeholder...") and is correctly `noindex`'d — the code is doing exactly what it was designed to do. The gap is that real content was never written and approved for any of the four.

### Footer
Now accurate after this session's earlier fix (the misleading three-link "Talent" column collapsed to one real link). Legal links all present and correctly routed. Tagline and service/studio link columns are clean and accurate.
- **Social links: confirmed empty** (`socialLinks: []` in both datasets) — not a bug, the site correctly shows nothing rather than broken icons, but worth a deliberate decision: does the business have real, active social accounts worth linking, or is "no social links yet" the intended launch state?

### Navigation (Desktop + Mobile)
Both clean and consistent. Desktop nav: Home logo, About/Services/Work/Workshops/Talent/Stories, Book a Service CTA. Mobile hamburger menu opens a full-screen overlay with the identical link set plus the same CTA — no missing items, no broken states, no console errors on either.

### Metadata / SEO / Open Graph
Already addressed earlier this session (`sitemap.ts` built, OG/Twitter card metadata added, a title-doubling regression caught and fixed same-day). Confirmed live: `/sitemap.xml` returns 200, homepage OG tags render correctly with a real image (not a placeholder).

### Images
The single biggest visual gap: nearly every image slot site-wide shows "Imagery coming soon" — homepage hero/departments, every service department's featured-work cards, every sample Portfolio/Journal/Workshop entry. This is consistent and honestly labeled (not broken image icons), but it is the dominant visual impression of the site as it stands today. Full requirement list already tracked in `MEDIA_UPLOAD_LIST.md`.

### Forms and Calls-to-Action
CTA copy is consistently strong and varied across the site ("Start a Project," "Collaborate With Us," "Book a Service," "Request a Production Quote," "Get in Touch") — no generic "Click Here" or "Submit" weakness found. The booking form itself (reviewed above) is well-built. No duplicate or contradictory CTAs found across pages.

---

## Phase 2 — Launch Readiness Content Checklist

### Critical Before Launch
Must be resolved before removing the holding page.

1. **Legal pages must be real and approved** — Privacy Notice, Website Terms, Cookie Notice, Booking Terms. Currently 100% unapproved drafts on production. This is the single most important item on this entire list, because `FORMS_SENDING_ENABLED` is already on and collecting real personal data.
2. **Portfolio, Journal, and Workshops content** — currently 100% `[SAMPLE]`. Either replace with real content (`CONTENT_READINESS_CHECKLIST.md`) or explicitly decide to unpublish/hide the sample entries for launch.
3. **Confirm the contact email and WhatsApp number are the ones the business actually wants publicly listed** — `ordift.ghana@gmail.com` and a UK (+44) WhatsApp number are both live on production right now.

### Recommended Before Launch
Should ideally be done, but launch isn't blocked on them.

1. **Real hero and department imagery** — the "Imagery coming soon" placeholder is currently on nearly every page; even a partial real-photo rollout (Home hero + top 2–3 department cards) would meaningfully change first impressions.
2. **A decision on social links** — either add real, active accounts, or confirm the empty state is intentional so it's not mistaken for an oversight later.
3. **A minor bio-copy polish** on the Founder page's Senior High School line — cosmetic, five minutes of work.

### Future Improvements
Can safely wait until after launch.

1. Once real Portfolio/Journal/Workshops content exists, revisit whether each department page's "Featured Work" section should pull curated picks rather than the same global feed everywhere.
2. Consider a branded email domain (`@ordiftstudios.com`) if not already available, as a longer-term brand-consistency improvement — not urgent if the Gmail address is a deliberate short-term choice.
3. Revisit Ordift Originals once there's an actual original project to announce — the current teaser section is honest and fine to leave as-is indefinitely.

---

## Phase 3 — Business Experience Review (by visitor type)

**Wedding client:** Lands on Home, sees premium positioning and a real, well-written About/Founder story — good trust signals. Immediately hits friction at Portfolio (`/work`) looking for real wedding photos and finds only `[SAMPLE]` entries. A wedding client shopping around will not book based on sample work; this is the persona most damaged by the current Portfolio gap.

**Commercial/corporate client:** Reads the Services pages and Founder bio and comes away with a clear, credible sense of process ("Discover → Plan → Create → Refine → Deliver") and professionalism. Corporate buyers are often more forgiving of "coming soon" sections if the process and communication feel solid — which they do here. The Gmail contact address is the one thing likely to register as slightly informal to a corporate buyer used to `@company.com` addresses.

**Portrait client:** Similar to the wedding client — the Photography department page's copy is strong, but the "Featured Work" gap undercuts it. A portrait client specifically wants to see faces and lighting style before booking; sample content doesn't answer that.

**Model / talent:** The Talent Management page is the most honestly-handled "not ready yet" page on the site — clear Coming Soon messaging, a real "Get in Touch" path rather than a dead-end. A prospective model would understand exactly what stage things are at and wouldn't feel misled. This is a genuine strength, not a gap.

**Event organizer:** Would want to see event-specific portfolio work and possibly the Workshops section (if events double as workshop venues) — both currently sample content. The booking flow's "Project location" and "Reference or mood-board link" fields are well-suited to event enquiries once real content exists to build confidence first.

**Potential partner/collaborator:** The "Collaborate With Us" CTA and the footer's honest "founder-led... works with selected creative professionals and production partners" framing set accurate expectations — a partner isn't misled into thinking this is a large agency. This persona is well-served by the current honest positioning.

**Common thread across all personas:** everyone who reaches the Portfolio, Journal, or Workshops section hits the same wall. Everyone who reads the About/Services/Founder content comes away with a strong, credible first impression. The gap is specifically "proof of work," not "trust in the business."

---

## Final Recommendations (Phase 5)

Only changes that meaningfully improve launch quality — nothing added for its own sake:

1. **Resolve the legal-pages gap before anything else.** This is the one item on this whole audit with real legal/trust exposure, not just a polish opportunity — it should be treated as the actual launch blocker, ahead of even the sample-content question.
2. **Prioritize real Portfolio content over real Journal/Workshops content, if all three can't be done at once.** Every persona reviewed above hits the Portfolio wall; Journal and Workshops are secondary to a first-time visitor deciding whether to book.
3. **Don't over-invest in imagery before launch** — the placeholder treatment is honest and consistently applied, not broken-looking. A full real-photo rollout is valuable but not launch-blocking the way legal pages and Portfolio content are.
4. **Confirm contact details are exactly what the business wants live**, then stop touching them — right now is the moment to decide, not after real visitors have already started using them.

---

*Cross-references: `CONTENT_READINESS_CHECKLIST.md` (field-by-field content requirements), `MEDIA_UPLOAD_LIST.md` (imagery requirements), `LAUNCH_CHECKLIST.md` (technical launch runbook, now incorporating this audit's Critical items), `FINAL_LAUNCH_CERTIFICATION.md` (overall readiness scores, updated same day to reflect this audit).*
