# Typography System — locked 2026-07-23

Decided after a full-page desktop and mobile comparison of Fraunces,
Space Grotesk, and Cormorant Garamond (see Brand Bible section 28 decision
log). **Fraunces + Inter is the approved, final system.** Space Grotesk
and Cormorant Garamond are retired — not loaded anywhere in the codebase,
to avoid unnecessary font loading. Live specimen: `/style-preview`
(internal, `noindex`, not part of the public site).

## Fonts

| Role | Font | Source | License | Notes |
|---|---|---|---|---|
| Display / headings | **Fraunces** | Google Fonts, variable | SIL OFL 1.1 | Variable font — full 100–900 weight range plus `opsz`, `SOFT`, `WONK` axes and a true italic (`ital`), loaded via `next/font/google`. No separate italic font file needed. |
| Body / navigation / buttons / forms / labels | **Inter** | Google Fonts, variable | SIL OFL 1.1 | Loaded via `next/font/google`. |

Both are self-hosted at build time by `next/font` (no runtime request to
Google Fonts, no render-blocking `<link>` tag), and `next/font` generates a
size-adjusted fallback automatically to minimize layout shift on load.

**Fallback stacks** (used automatically by `next/font`, documented here for
reference/non-web contexts like presentation decks):
- Fraunces → `ui-serif, Georgia, "Times New Roman", serif`
- Inter → `ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif`

## Type scale

Base value = mobile (<640px). Apply with `sm:` for tablet (≥640px) and
`lg:` for desktop (≥1024px) — e.g. `text-hero sm:text-hero-tablet
lg:text-hero-desktop`. All tokens are defined in `src/app/globals.css`
under `@theme`, generating real Tailwind utilities (`text-hero`,
`text-page-title`, etc.), each with a paired default line-height.

| Category | Font | Weight | Mobile | Tablet | Desktop | Line-height (m/t/d) | Letter-spacing | Usage |
|---|---|---|---|---|---|---|---|---|
| Hero Headline | Fraunces | 500 | 36px | 60px | 72px | 1.1 / 1.08 / 1.05 | normal | Homepage hero, full-bleed cinematic statements |
| Page Title | Fraunces | 500 | 30px | 48px | 60px | 1.15 / 1.1 / 1.08 | normal | Department pages, About, Journal index — top-of-page H1 |
| Section Heading | Fraunces | 500 | 20px | 24px | 30px | 1.3 / 1.25 / 1.2 | normal | In-page section titles ("Explore our departments") |
| Card Title | Fraunces | 500 | 18px | 18px | 20px | 1.3 / 1.3 / 1.3 | normal | Department cards, journal cards, portfolio project titles |
| Body Text | Inter | 400 | 16px | 16px | 18px | 1.6 / 1.6 / 1.6 | normal | Paragraph copy |
| Small Body Text | Inter | 400 | 14px | 14px | 14px | 1.55 (all) | normal | Card descriptions, form helper text |
| Eyebrow / Overline | Inter | 600 | 12px | 12px | 14px | 1.4 (all) | 0.2em, uppercase | Category labels above headings |
| Navigation | Inter | 500 | 14px | 14px | 14px | 1.4 (all) | normal | Header nav links, footer links |
| Button Text | Inter | 600 | 14px | 14px | 14px | 1 (all) | normal | Primary/secondary CTAs, form submit buttons |
| Captions | Inter | 400 | 12px | 12px | 12px | 1.5 (all) | normal | Image captions, form field notes, footnotes |
| Quotes | Fraunces (italic) | 400 | 20px | 24px | 30px | 1.4 / 1.35 / 1.3 | normal | Pull quotes, editorial statements (Brand Bible callouts) |

## Accessibility

- **Minimum body size is 16px** on mobile — meets the common WCAG-aligned
  recommendation for comfortable reading size; nothing running-text-length
  goes smaller than 14px (Small Body Text / Navigation / Button / Eyebrow),
  and nothing goes below 12px anywhere (Captions is the floor).
- **Line-height ≥1.5 on all body-length text** (Body Text, Small Body Text,
  Captions) per WCAG 1.4.12 (Text Spacing). Headings/display text use
  tighter line-heights intentionally (standard practice for large display
  type, not a spacing violation — 1.4.12 governs user-adjustable spacing on
  body text, not fixed display headlines).
- **Minimum weight floor:** nothing under 20px uses a Fraunces weight below
  500 — Card Title, Page Title, Section Heading, Hero Headline all sit at
  500 specifically so the serif's finer strokes don't thin out at small
  sizes. Quotes is the one intentional exception (400 italic), used only
  at 20px+ where the italic remains legible.
- **Color contrast** is governed separately by the navy/gold/off-white
  palette (Brand Bible section 28) and is still pending its own WCAG AA
  contrast pass once real layouts exist — not re-litigated here.
- **Touch targets:** button/nav tap targets must be ≥44×44px in
  implementation regardless of the 14px text size inside them — this is a
  padding/hit-area requirement, not a font-size one; flagged here so it
  isn't missed when components are built.

## What's explicitly not in scope here

- Exact Fraunces optical-size/SOFT/WONK axis tuning per component (the
  variable font's default interpolation is used for now; can be refined
  per-component later without a font reload).
- A dedicated monospace token (none of the 11 categories needed one; add
  one only if a real use case — e.g. a booking reference number display —
  requires it).
