# Ordift Studios Legal Suite — Version 1.0

**Status:** DRAFT SCAFFOLD. Every section below is either (a) factual/operational content drafted to production quality from the verified live platform, or (b) explicitly marked as requiring a business decision and qualified legal review, per your explicit instruction. **No section marked "Business Decision Required" contains finished legal language — treat those as structured placeholders, not drafted clauses.** This entire document is `isApproved: false` in spirit as well as in the underlying legal-page records; nothing here is published or binding until you say so.

**Companion document:** `LEGAL_REVIEW_REPORT.md` — the pre-draft audit and post-draft business protection review.

---

# Part 1 — Legal Suite Introduction

## 1.1 Purpose
This suite exists to give Ordift Studios one coherent, internally consistent set of legal and policy documents governing the website, the Client Portal, bookings, workshops, delivered creative work, and the data collected throughout — replacing four independent pages that each defined their own terms and duplicated the same facts differently.

## 1.2 Scope
This suite covers ordiftstudios.com, the Client Portal (`/portal/*`), the public booking and workshop-registration flows, and Ordift Studios' handling of client and visitor data and delivered creative work. It does not cover internal staff systems (`/admin`, `/studio`) beyond what's necessary to describe data handling accurately — those are governed by internal policy, not this public-facing suite.

## 1.3 Document Hierarchy
1. **This Introduction and the Shared Definitions (Parts 1–2)** govern interpretation of every other part.
2. **Part 3 (Privacy Notice)** governs data handling and takes precedence on data questions specifically.
3. **Part 6 (Website Terms)** is the general-use agreement; **Parts 4, 5, 7–11** are specific supplements that apply in addition to it for their particular context (booking, cookies, media usage, IP, AI workflows, the Client Portal, workshops respectively).
4. Where a specific part conflicts with the general Website Terms on its own subject matter, the specific part governs.

## 1.4 Versioning
This is **Version 1.0** of the suite. Each part carries the same version number and "last updated" date as the suite itself unless a single part is updated independently, in which case only that part's date changes and this Introduction notes the discrepancy. Version history is tracked in `MILESTONES.md`, consistent with how every other living document in this project is maintained.

## 1.5 Definitions and Interpretation
Capitalized terms used across this suite are defined once, in Part 2, and used consistently everywhere else. Headings are for convenience only and don't affect interpretation. "Including" means "including without limitation" throughout.

## 1.6 Shared Terminology
Every part of this suite uses the Part 2 definitions rather than redefining terms locally. If a future part needs a new term, it should be added to Part 2, not defined locally within that part.

---

# Part 2 — Shared Definitions

| Term | Definition |
|---|---|
| **Ordift Studios** / **we** / **us** / **our** | The multidisciplinary creative studio operating as Ordift Studios, based in Ghana. |
| **Client** | A person or organisation who has engaged, or is in the process of engaging, Ordift Studios for Services, whether or not a Booking has been confirmed. |
| **Visitor** | Any person browsing the Site who has not (yet) become a Client. |
| **User** | A Client, Visitor, workshop attendee, or Account holder — used where a statement applies regardless of which category someone falls into. |
| **Site** | ordiftstudios.com and all pages, forms, and functionality on it. |
| **Client Portal** / **Portal** | The authenticated area of the Site at `/portal/*`, used by Clients, workshop participants, and Ordift Studios staff/collaborators. |
| **Account** | A registered Client Portal login, created via the Site's signup flow. |
| **Booking** | A confirmed engagement for Services, reached only after the process described in Part 4 (Booking Terms) — not the same as an Enquiry. |
| **Enquiry** | A Contact Enquiry, Booking request, Workshop Registration, or Project Request submitted through the Site — none of which, by themselves, confirm a Booking. |
| **Services** | The creative services Ordift Studios offers, including Photography, Videography, Film, Branding, Design, Creative Consultancy, Content Creation, and Production Services, as described on the Site's Services pages. |
| **Workshop** | An educational or training event offered by Ordift Studios, registered for via the Site's Workshop Registration flow. |
| **Project** | The specific engagement of Services agreed with a Client for a particular Booking. |
| **Creative Works** / **Deliverables** | The photographs, film, designs, and other creative output produced by Ordift Studios for a Project and provided to the Client. |
| **Portfolio** | The curated selection of past Creative Works displayed publicly on the Site, in marketing materials, or on Ordift Studios' social media. |
| **Media** | Any photograph, video, audio recording, or other recorded content captured or produced by Ordift Studios in connection with a Project or Workshop. |
| **Commercial Licence** | A grant of rights to use Creative Works for a defined purpose, scope, and duration, as distinct from Ordift Studios' underlying copyright ownership — see Part 8. |
| **Personal Data** | Information relating to an identified or identifiable individual, collected as described in Part 3. |
| **Confidential Information** | Non-public information disclosed by one party to the other in connection with a Project, that a reasonable person would understand to be confidential given its nature or the circumstances of disclosure. |
| **AI-assisted Processing** | Any use of artificial intelligence or machine learning tools in connection with Ordift Studios' Services or the Site — see Part 9 for current status. |
| **Business Day** | A day other than a Saturday, Sunday, or public holiday in Ghana. |
| **Force Majeure** | An event beyond a party's reasonable control that prevents performance — see the placeholder in Part 4 for the operative clause, since the scope of qualifying events requires jurisdiction-specific drafting. |

---

# Part 3 — Privacy Notice

*Replaces the previously approved-pending Privacy Notice draft. Factual sections drafted to production quality from the verified live platform; sections requiring legal judgment are marked accordingly.*

### 3.1 Who We Are
Ordift Studios ("we", "us", "our") is a multidisciplinary creative studio operating in Ghana. This notice applies to the Site and the Client Portal.

### 3.2 What We Collect
When you submit an Enquiry, we collect the information you provide: your name, email address, phone or WhatsApp number, and details about your Project. If you create an Account, we also collect your email address and a securely hashed password, plus any profile information you choose to add. We do not collect payment card details through the Site.

### 3.3 Why We Collect It
We use this information to respond to your Enquiry, discuss and deliver Services, manage your Booking or Workshop registration, operate your Account, and, only if you separately opt in, send you occasional news and Workshop updates. We never use your Enquiry details for marketing unless you tick the separate, optional marketing checkbox.

### 3.4 Marketing Consent Withdrawal
If you've opted in to marketing communications, you can withdraw that consent at any time by emailing us and asking to be removed. As of this version, there is no self-service unsubscribe link in marketing emails themselves — withdrawal is handled by direct request. **[Note for future development: a self-service unsubscribe mechanism would be a genuine product improvement once marketing sends are actually active, not just a documentation matter.]**

### 3.5 How Your Data Is Protected Against Automated Abuse
Our forms use Cloudflare Turnstile, a privacy-focused challenge that helps confirm you are a real visitor rather than an automated script, before your submission is processed.

### 3.6 Where Your Data Is Stored
Your Enquiry or registration is stored in our database, hosted by Supabase, with access restricted to authorised Ordift Studios staff. A copy of the same information is also kept in an internal, access-restricted operations spreadsheet, hosted via Google's infrastructure through a Google Cloud service account, purely so our team can track and action Enquiries day to day. Confirmation and notification emails are sent through Resend, our email delivery provider. Automated-abuse protection is provided by Cloudflare.

### 3.7 International Data Transfers

> **[BUSINESS DECISION REQUIRED — REQUIRES QUALIFIED LEGAL REVIEW]**
> **Purpose of this clause:** to honestly disclose that data processed through the Site crosses international borders (Supabase's database region, and the global infrastructure of Resend, Cloudflare, and Vercel), and to state what safeguards apply.
> **Known facts to work from (not yet turned into compliant clause language):** Supabase's production database is hosted in the Frankfurt (EU) region. Resend, Cloudflare, and Vercel operate global infrastructure whose exact processing locations for this project haven't been individually audited.
> **Business decisions required:** whether Ordift Studios needs to represent compliance with any specific international transfer framework, and if so, which one, based on where actual and prospective Clients are located.
> **Why legal review is recommended:** international data transfer compliance (e.g., GDPR Chapter V-style safeguards) depends on which jurisdictions' visitors/Clients you're actually serving, and misstating compliance is worse than an honest placeholder.
> **Drafting note for counsel:** the underlying technical facts above are accurate as of 2026-07-30; verify current processor regions before finalizing, since these can change without this document being updated automatically.

### 3.8 Legal Basis for Processing

> **[BUSINESS DECISION REQUIRED — REQUIRES QUALIFIED LEGAL REVIEW]**
> **Purpose of this clause:** to state the legal basis (e.g., contract necessity, consent, legitimate interest) for each category of processing described above.
> **Business decisions required:** none directly — this depends on legal analysis of the processing described in 3.2–3.6, not a business choice.
> **Why legal review is recommended:** correctly mapping "legal basis" language to actual processing activities is a legal determination, not a factual restatement.
> **Drafting note for counsel:** sections 3.2–3.6 above are accurate, current descriptions of actual processing to build this analysis from.

### 3.9 How Long We Keep It
We keep Enquiry, Booking, and Workshop registration records for as long as reasonably needed to deliver the Services requested and to maintain accurate business records, after which they are deleted or anonymised. Accounts are kept for as long as they remain active, and you may request deletion at any time.

### 3.10 Deletion Requests
You can ask us to delete your Personal Data by emailing us. We will action deletion requests within a reasonable time, except where we're required to retain certain records by law (e.g., financial records) or need to retain minimal information to enforce our own agreements.

### 3.11 Security Disclaimer
We take reasonable technical and organisational measures to protect your Personal Data, including the access controls, encryption-in-transit, and automated-abuse protections described above. No method of storage or transmission is completely secure, and we cannot guarantee absolute security.

### 3.12 Cookies
The Site uses a small number of strictly necessary cookies, described in full in Part 5 (Cookie Notice).

### 3.13 Portfolio Usage
Personal Data collected through Enquiry forms is never used in the Portfolio. Where Media of a Client, model, or Workshop attendee is used in the Portfolio or marketing materials, that is governed separately by Part 7 (Media Usage & Portfolio Policy), not by this Privacy Notice.

### 3.14 AI-Assisted Workflows
As of this version, the Site's production systems do not use AI-assisted processing of Personal Data in any automated capacity. See Part 9 for the full current status and future policy placeholder.

### 3.15 Future Integrations
As new external services are introduced, this notice will be updated to describe them, consistent with how `TECHNOLOGY_COST_REGISTER.md` is maintained as a living document. Google Analytics is the one such integration currently named in official project planning (see `TECHNOLOGY_COST_REGISTER.md`); it is not active as of this version, and this notice will be updated before it is, if it is.

### 3.16 Your Rights
You can ask us what Personal Data we hold about you, ask us to correct it, or ask us to delete it, by emailing us. We will respond within a reasonable time.

### 3.17 Children
The Site is not directed at children, and we do not knowingly collect Personal Data from children through the Site's forms. This is separate from the question of photographing children during Services — see the placeholder in Part 7.

### 3.18 Changes to This Notice
If we change how we handle Personal Data, we will update this Part and the date at the top of this suite.

---

# Part 4 — Booking Terms

*Governs Bookings, Enquiries, and the delivery of Services, in addition to the general Website Terms (Part 6).*

### 4.1 Booking Lifecycle
Submitting an Enquiry does not confirm a Booking, price, or date. The lifecycle is: (1) Enquiry submitted, (2) we review and respond to discuss availability, scope, timeline, and pricing, (3) a quote or proposal is issued, (4) the Booking is confirmed once both parties agree the quote in writing and, where applicable, any required deposit is received.

### 4.2 Quotes
Following an Enquiry, we provide a quote or proposal covering scope, timeline, and pricing specific to the Project. Quotes are not published on the Site since every Project's scope differs.

### 4.3 Deposits and Payment Terms

> **[BUSINESS DECISION REQUIRED — REQUIRES QUALIFIED LEGAL REVIEW]**
> **Purpose of this clause:** to state deposit percentage, payment schedule, accepted payment methods, and consequences of late/non-payment.
> **Business decisions required:** the deposit percentage (if any), payment schedule, and accepted payment methods. Note per `TECHNOLOGY_COST_REGISTER.md`: no online payment processing is currently implemented on the Site — all payment today happens outside the platform, by arrangement.
> **Why legal review is recommended:** payment default and late-payment consequences (interest, suspension of work) are enforceable-clause territory, not just a business preference.
> **Drafting note for counsel:** once online payments are actually implemented (see Part 4.21), this section will need to reference the payment processor by name and its own terms.

### 4.4 Project Confirmation
A Booking is only confirmed once both parties have agreed the quote in writing (including by email) and, where applicable, any required deposit has been received.

### 4.5 Client Responsibilities
The Client agrees to provide accurate information, respond to communications in a timely manner, and cooperate reasonably with scheduling and creative-direction requests necessary to deliver the Project.

### 4.6 Ordift Studios' Responsibilities
We agree to deliver Services with reasonable skill and care, communicate proactively about scope, timeline, and any issues affecting delivery, and exercise the creative discretion described in 4.9 in good faith and consistent with the agreed brief.

### 4.7 Rescheduling and Cancellation

> **[BUSINESS DECISION REQUIRED — REQUIRES QUALIFIED LEGAL REVIEW]**
> **Purpose of this clause:** to state the rescheduling/cancellation window, any applicable fee, and how deposits are treated on cancellation.
> **Business decisions required:** the specific window (e.g., 48 hours, 7 days) and fee structure.
> **Why legal review is recommended:** cancellation-fee enforceability varies by jurisdiction and needs to be reasonable/proportionate to survive challenge.
> **Drafting note for counsel:** this section and 4.8 (late arrival/weather) are closely related — consider drafting together.

### 4.8 Late Arrival and Weather

> **[BUSINESS DECISION REQUIRED — REQUIRES QUALIFIED LEGAL REVIEW]**
> **Purpose of this clause:** to state what happens if a Client arrives late to a scheduled session, or if weather affects an outdoor shoot.
> **Business decisions required:** grace-period length, and whether/how outdoor sessions get rescheduled for weather versus proceeding as booked.
> **Why legal review is recommended:** related to the Force Majeure clause below; best drafted together for consistency.
> **Drafting note for counsel:** this is largely an operational policy question dressed as a legal clause — the business decision matters more here than the legal wording, but the two should still be reviewed together with Force Majeure.

### 4.9 Creative Discretion
Ordift Studios retains creative and artistic discretion in the style, composition, and execution of Services, exercised within the brief agreed with the Client.

### 4.10 Force Majeure

> **[BUSINESS DECISION REQUIRED — REQUIRES QUALIFIED LEGAL REVIEW]**
> **Purpose of this clause:** to excuse performance delays caused by events genuinely beyond either party's control.
> **Business decisions required:** none directly — this is close to pure legal drafting, though the *list* of qualifying events (illness, civil unrest, extreme weather, power/internet outages relevant to a Ghana-based creative business) benefits from your input.
> **Why legal review is recommended:** enforceability and scope of Force Majeure clauses is genuinely jurisdiction-specific; a generic template clause can be unenforceable or, worse, misleadingly narrow.
> **Drafting note for counsel:** consider whether Ghana-specific events (e.g., load-shedding/power availability, if relevant to production work) warrant explicit mention.

### 4.11 Delivery Timelines

> **[BUSINESS DECISION REQUIRED — REQUIRES QUALIFIED LEGAL REVIEW]**
> **Purpose of this clause:** to state a standard delivery timeline (or the process for agreeing one per Project).
> **Business decisions required:** whether a standard timeline exists across Services, or whether it's always Project-specific (current evidence from the codebase suggests the latter — no standard timeline field exists in any schema).
> **Why legal review is recommended:** low legal risk, mostly a business-policy decision, but worth reviewing alongside the revision-limits and refund clauses since they interact.
> **Drafting note for counsel:** low complexity; the main task is capturing your actual operational practice accurately.

### 4.12 Preview Galleries and Final Delivery

> **[BUSINESS DECISION REQUIRED]**
> **Purpose of this clause:** to describe the preview-to-final-delivery process (if one exists) and how Deliverables are provided.
> **Business decisions required:** whether a preview-gallery step is part of the standard process. Known fact: Deliverables in the Client Portal are provided as links to externally-hosted files (per the platform's "reference links, not uploads" design), not files stored or served directly by Ordift Studios' own infrastructure.
> **Why legal review is recommended:** low — mostly operational description once the business process is confirmed.
> **Drafting note for counsel:** the external-link delivery model above is a real, verified platform fact, safe to build final wording on directly.

### 4.13 Revision Limits

> **[BUSINESS DECISION REQUIRED]**
> **Purpose of this clause:** to state how many rounds of revision are included, and the cost/process for additional revisions.
> **Business decisions required:** the actual number and additional-revision pricing/process.
> **Why legal review is recommended:** low legal complexity; primarily a pricing/scope decision.

### 4.14 RAW Files and Backups

> **[BUSINESS DECISION REQUIRED]**
> **Purpose of this clause:** to state whether RAW/source files are provided to Clients, and Ordift Studios' own backup retention practice for delivered work.
> **Business decisions required:** RAW-file provision policy (included, available at extra cost, or never provided), and how long delivered work is retained in Ordift Studios' own backups after delivery.
> **Why legal review is recommended:** low — a factual/operational statement once policy is set, though it interacts with the IP/licensing terms in Part 8.

### 4.15 Copyright and Licensing
See Part 8 (Intellectual Property Policy) for the full framework. As a starting position, carried forward from the earlier draft: unless otherwise agreed in writing, Ordift Studios retains copyright in Creative Works produced, and grants the Client a licence to use delivered work for the agreed purpose. **This is a reasonable industry-standard default, not a final position — confirm it matches your intended policy, particularly for commercial licensing or exclusive buy-out scenarios (Part 8).**

### 4.16 Portfolio Rights
See Part 7 (Media Usage & Portfolio Policy) for the full framework governing whether and how a Project's Creative Works may appear in the Portfolio.

### 4.17 Confidential Projects
Where a Client designates a Project as confidential, Ordift Studios agrees not to disclose Confidential Information about that Project, including not using its Creative Works in the Portfolio, marketing, or social media, without the Client's separate written permission. This is a reasonable, low-risk mutual confidentiality position — flagged as drafted-to-production-quality, not a placeholder, though it should still be included in any formal legal review pass.

### 4.18 Model Releases and Property Releases
See Part 7 (Media Usage & Portfolio Policy) for the full placeholder and drafting notes — this is one of the most significant open items in the entire suite, since no release-capture mechanism currently exists in the platform at all.

### 4.19 Payment Defaults and Refunds

> **[BUSINESS DECISION REQUIRED — REQUIRES QUALIFIED LEGAL REVIEW]**
> **Purpose of this clause:** to state consequences of non-payment and the refund policy, if any.
> **Business decisions required:** refund policy (if any), and consequences of payment default (e.g., withholding delivery, interest, collection).
> **Why legal review is recommended:** default/interest terms and refund enforceability are genuine legal-drafting territory.

### 4.20 International Projects

> **[BUSINESS DECISION REQUIRED — REQUIRES QUALIFIED LEGAL REVIEW]**
> **Purpose of this clause:** to address currency, cross-border delivery, and any additional terms for Clients or Projects outside Ghana.
> **Business decisions required:** whether international Projects are accepted at all, and if so, currency/payment logistics.
> **Why legal review is recommended:** overlaps with the governing-law/dispute-resolution placeholder in Part 6 — best reviewed together.

### 4.21 Future Online Payments
As of this version, no online payment processing exists on the Site (confirmed via `TECHNOLOGY_COST_REGISTER.md` and the codebase — payment happens entirely outside the platform, by arrangement). If online payment is ever implemented, this section will be updated to name the processor and reference its terms, consistent with how `TECHNOLOGY_COST_REGISTER.md` tracks new dependencies.

### 4.22 Changes to These Terms
We may update these Booking Terms from time to time; the version in effect at the time a Booking is confirmed applies to that Booking.

### 4.23 Contact
Questions about a specific Enquiry, Booking, or Workshop registration should be sent to the contact details listed on our Contact page.

---

# Part 5 — Cookie Notice

*Almost entirely factual/technical; drafted to production quality throughout, verified against the actual codebase (no `localStorage`/`sessionStorage` usage found anywhere in the Site).*

### 5.1 What Are Cookies
Cookies are small text files placed on your device when you visit a website, used to make the site work correctly or to remember information about your visit.

### 5.2 Strictly Necessary Cookies
The Site's public forms use Cloudflare Turnstile, which sets a cookie to confirm you are a genuine visitor rather than an automated script. This cookie is required for the forms to function and cannot be turned off if you want to submit a form.

### 5.3 Client Portal Cookies
If you log in to the Client Portal, a secure session cookie is set so you stay signed in as you move between pages. This cookie is required for the Portal to work and is removed when you sign out or your session expires.

### 5.4 Local Storage and Session Storage
As of this version, the Site does not use browser local storage or session storage for any purpose — verified directly against the codebase, not assumed.

### 5.5 What We Do Not Currently Use
As of the date of this version, the Site does not use advertising cookies, third-party marketing trackers, or analytics cookies. If that changes, we will update this notice before any such cookie is set, and where required we will ask for your consent first.

### 5.6 Future Analytics (Google Analytics / Meta)
Google Analytics is named in `PRODUCT_ROADMAP.md` as a pending decision — not yet built, no measurement ID configured. No Meta/Facebook tracking of any kind is named anywhere in this project's roadmap or codebase; it does not appear in this suite as a "future" item because it isn't an approved plan, only Google Analytics is.

### 5.7 Future Cookie Banner
If analytics or marketing cookies are ever introduced, a cookie consent banner will be implemented before those cookies are set, and this notice will be updated accordingly at that time — consistent with the Site's existing legal-gating pattern (`LEGAL_PAGES_APPROVED` gates real form-sending; the same discipline will apply to any future consent-requiring cookie).

### 5.8 Managing Cookies
Because the cookies described above are strictly necessary for the Site's core functionality, we do not currently offer a cookie-preferences toggle. You can still clear or block cookies through your browser settings, though doing so may prevent forms and the Client Portal from working correctly.

### 5.9 Changes to This Notice
If the cookies we use change, we will update this Part and the date at the top of this suite.

---

# Part 6 — Website Terms

*Expanded from the previous Website Terms; general-use agreement for the Site, applying alongside the specific Parts above for their respective contexts.*

### 6.1 About Us
Ordift Studios is a multidisciplinary creative studio operating in Ghana, offering the Services described on the Site.

### 6.2 Acceptable Use
You may browse the Site and use its forms for their intended purpose. You agree not to: misuse the Site, attempt to bypass security measures (including the spam-prevention checks described in Part 3.5), submit false information, or attempt to access areas of the Site (including the Client Portal or administrative tools) without authorisation.

### 6.3 Scraping, Automation, and Reverse Engineering
You agree not to scrape, systematically extract data from, or use automated tools to interact with the Site beyond normal browsing and form use, and not to reverse engineer, decompile, or attempt to extract the source code of the Site.

### 6.4 AI Misuse
You agree not to use AI tools to generate mass, automated, or fraudulent submissions to the Site's forms, or to attempt to circumvent the Site's automated-abuse protections (Part 3.5) using AI-assisted tooling.

### 6.5 Security
You agree not to attempt to gain unauthorised access to any part of the Site, including the Client Portal, `/admin`, or `/studio`, or to any data, system, or network connected to the Site.

### 6.6 Client Portal
Use of the Client Portal is additionally governed by Part 10 (Client Portal Terms).

### 6.7 Availability and Maintenance
We aim to keep the Site available, but do not guarantee uninterrupted availability. The Site may be unavailable during planned maintenance or due to circumstances beyond our reasonable control.

### 6.8 Content and Intellectual Property
Unless stated otherwise, all text, images, videos, and design on the Site are owned by Ordift Studios or used with permission, and may not be copied, reproduced, or reused without our prior written consent. Portfolio work shown on the Site may be subject to separate rights held by Clients or collaborators — see Part 8 for the full IP framework.

### 6.9 Third-Party Services
The Site may link to or rely on third-party services (see `TECHNOLOGY_COST_REGISTER.md` for the current, verified list). We are not responsible for the content or practices of third-party services we link to but don't control.

### 6.10 Submitted Information
When you submit an Enquiry, you confirm the information you provide is accurate to the best of your knowledge. Submitting a form does not, by itself, confirm a Booking, service agreement, or Workshop place — see Part 4 for how that process works.

### 6.11 No Warranty
The Site and its content are provided "as is". While we take reasonable care to keep information accurate and the Site available, we do not guarantee the Site will always be error-free, uninterrupted, or available.

### 6.12 Limitation of Liability
To the fullest extent permitted by law, Ordift Studios is not liable for any indirect or consequential loss arising from your use of the Site. Nothing in these terms limits liability that cannot lawfully be limited. **[Note: this is deliberately general, non-numeric language carried forward from the earlier draft. A specific liability cap (e.g., a maximum monetary figure) would be a further Business Decision Required with its own legal review — not included here since no such figure has been set.]**

### 6.13 Dispute Resolution

> **[BUSINESS DECISION REQUIRED — REQUIRES QUALIFIED LEGAL REVIEW]**
> **Purpose of this clause:** to state how disputes are resolved (negotiation, mediation, arbitration, or courts) before litigation, if at all.
> **Business decisions required:** whether a specific dispute-resolution mechanism (e.g., mediation first) is wanted, and if so, which one and where.
> **Why legal review is recommended:** genuine jurisdiction-specific drafting, especially given the International Clients context named in this suite's brief.
> **Drafting note for counsel:** review together with 6.14 (Governing Law) and 4.20 (International Projects).

### 6.14 Governing Law
These terms are governed by the laws of Ghana. **[This statement is grounded in fact — Ghana is the business's real, actual location — and is carried forward from the earlier draft. It has not been reviewed by Ghanaian counsel for completeness, and does not address what happens when a Client is in a jurisdiction with mandatory consumer-protection law that this clause can't override — see the Dispute Resolution placeholder above and Section 3.7's international-transfer placeholder, which raise related questions.]**

### 6.15 Future Services
As new Services or platform capabilities are introduced, these terms will be updated to reflect them, consistent with how this suite as a whole is maintained as a living document.

### 6.16 Changes to These Terms
We may update these terms from time to time. Continued use of the Site after changes are posted means you accept the updated terms.

### 6.17 Contact
Questions about these terms can be sent to the contact details listed on our Contact page.

---

# Part 7 — Media Usage & Portfolio Policy (NEW)

*Entirely new document. This is the single most consequential part of the suite from a business-risk standpoint — see `LEGAL_REVIEW_REPORT.md` Part B for why.*

### 7.1 Purpose
This policy explains how Ordift Studios uses Media captured or produced in connection with Services, including in the Portfolio, on social media, in marketing materials, and elsewhere.

### 7.2 Where Media May Be Used
Absent a Client's specific written restriction (Section 7.10), Media may be used in the Portfolio, on the Site's galleries, on Ordift Studios' social media, and in general marketing materials.

### 7.3 Testimonials
Client testimonials are used only with the Client's specific permission for that testimonial, obtained separately from general Media usage permission.

### 7.4 Commercial Campaigns, Private Commissions, and Corporate Clients

> **[BUSINESS DECISION REQUIRED]**
> **Purpose of this clause:** to distinguish default Media-usage rights for commercial/campaign work, private commissions, and corporate Clients, since these often have different expectations than general portfolio work.
> **Business decisions required:** whether commercial/corporate Projects default to more restrictive usage (requiring explicit opt-in rather than opt-out) given typical industry practice and likely Client expectations.
> **Why legal review is recommended:** commercial contracts in this space often have Client-side legal review of their own; Ordift Studios' default position should anticipate that.

### 7.5 Weddings
Wedding Media follows the general default (Section 7.2) unless the Client requests otherwise (Section 7.10). **[Note: weddings frequently include images of guests, including children, who are not the Client themselves and haven't individually consented — see 7.6.]**

### 7.6 Children

> **[BUSINESS DECISION REQUIRED — REQUIRES QUALIFIED LEGAL REVIEW — PRIORITY ITEM]**
> **Purpose of this clause:** to establish a specific policy for photographing/recording children and using their imagery, distinct from the general adult-Client default.
> **Business decisions required:** whether children's imagery requires a parent/guardian's separate written consent before any Portfolio/marketing use, and how that consent is captured given no release-capture mechanism currently exists on the platform.
> **Why legal review is recommended:** most jurisdictions treat children's imagery and data with heightened protection; this is flagged in `LEGAL_REVIEW_REPORT.md` as a priority item, not an equal-weight placeholder among the others.
> **Drafting note for counsel:** this interacts directly with 7.7 (Model Releases) — likely needs its own dedicated release form/process, not just policy language.

### 7.7 Model Releases

> **[BUSINESS DECISION REQUIRED — REQUIRES QUALIFIED LEGAL REVIEW — PRIORITY ITEM]**
> **Purpose of this clause:** to establish the process for obtaining a model's written consent to use their likeness in the Portfolio, marketing, or commercial contexts.
> **Business decisions required:** the release form/process itself doesn't exist yet, on paper or digitally — this needs to be built, not just written about.
> **Why legal review is recommended:** model releases are legally binding consent instruments; getting scope (which uses, which duration, revocability) wrong creates real exposure, not just a documentation gap.
> **Drafting note for counsel:** flagged in `LEGAL_REVIEW_REPORT.md` as the suite's single largest open risk — recommend prioritizing this over lower-stakes placeholders elsewhere in the suite.

### 7.8 Property Releases

> **[BUSINESS DECISION REQUIRED — REQUIRES QUALIFIED LEGAL REVIEW]**
> **Purpose of this clause:** to establish the process for obtaining permission to photograph/film private property and use that Media commercially.
> **Business decisions required:** same as 7.7 — the process needs to be built, not just documented.
> **Why legal review is recommended:** property rights and commercial-use restrictions vary by context (private residence vs. business vs. public space).

### 7.9 Revoking Permission

> **[BUSINESS DECISION REQUIRED]**
> **Purpose of this clause:** to state whether and how a Client, model, or property owner can revoke previously-given Media usage permission after the fact.
> **Business decisions required:** the revocation process and its practical limits (e.g., Media already printed/published elsewhere can't be un-published).
> **Why legal review is recommended:** low-to-moderate — mostly needs to be realistic and consistent with 7.7/7.8 once those are drafted.

### 7.10 Client Opt-Outs
A Client may request in writing, at any time before or shortly after a Project, that their Media not be used in the Portfolio or marketing. Requests made after Media has already been published are handled on a reasonable-efforts basis, consistent with 7.9.

### 7.11 Crediting
Ordift Studios will credit collaborators (models, other creatives, venues where relevant) consistent with industry practice, unless a Client or collaborator requests otherwise.

### 7.12 Editorial Use and Press

> **[BUSINESS DECISION REQUIRED]**
> **Purpose of this clause:** to distinguish editorial/press use (e.g., a magazine feature) from commercial/marketing use, since these are often treated differently in release agreements.
> **Business decisions required:** whether editorial/press use requires separate permission from general Portfolio use.

### 7.13 Licensing to Third Parties
See Part 8 (Intellectual Property Policy) for the full licensing framework — this Part covers Ordift Studios' own use of Media, not licensing it to others.

### 7.14 AI-Assisted Editing
See Part 9 for the current status of AI-assisted processing generally. As of this version, no automated AI editing pipeline exists in the platform.

### 7.15 Confidential Projects
See Part 4.17 — confidential Projects are excluded from Portfolio/marketing use without separate written permission.

### 7.16 International Clients

> **[BUSINESS DECISION REQUIRED]**
> **Purpose of this clause:** to address whether Media-usage rights differ for international Clients (whose home jurisdictions may have different imagery/consent norms).
> **Business decisions required:** none identified beyond what 7.4 and the general international-Client questions in Part 4.20/6.13 already raise.

### 7.17 Future Promotional Material
As new marketing channels or promotional formats are used, they're covered by the same default (Section 7.2) unless a specific format requires separate treatment, in which case this Part will be updated.

---

# Part 8 — Intellectual Property Policy (NEW)

*Separate from Booking Terms, as requested — the general default position is stated here in full, with commercial structures placeholdered.*

### 8.1 Ownership
Unless otherwise agreed in writing, Ordift Studios owns copyright in all Creative Works it produces, from the moment of creation.

### 8.2 Standard Licence to Clients
Delivered Creative Works come with a licence for the Client to use them for the purpose agreed at Booking (e.g., personal use, a specific campaign) — this is a starting default position, not a final one; confirm it matches your intended policy.

### 8.3 Exclusive Licences and Buy-Outs

> **[BUSINESS DECISION REQUIRED — REQUIRES QUALIFIED LEGAL REVIEW]**
> **Purpose of this clause:** to define what an "exclusive licence" or "buy-out" means for Ordift Studios' work, and its pricing/process.
> **Business decisions required:** whether buy-outs are offered at all, and if so, the structure and pricing basis.
> **Why legal review is recommended:** these are commercially significant terms; getting scope wrong (e.g., an unintentionally perpetual/unlimited buy-out) has real financial consequences.

### 8.4 Print Rights

> **[BUSINESS DECISION REQUIRED]**
> **Purpose of this clause:** to state whether/how print rights are included in or separate from the standard licence.
> **Business decisions required:** print-rights policy and any quantity/format limits.

### 8.5 Digital Rights

> **[BUSINESS DECISION REQUIRED]**
> **Purpose of this clause:** to state the scope of digital-use rights (web, social, app) included in the standard licence.
> **Business decisions required:** whether digital rights are unlimited-scope or platform/purpose-limited by default.

### 8.6 Social Media Rights
Consistent with the standard licence (8.2), Clients may use delivered Creative Works on their own social media for the agreed purpose, unless a Project's agreement states otherwise.

### 8.7 Website Use
Consistent with the standard licence (8.2), Clients may use delivered Creative Works on their own website for the agreed purpose.

### 8.8 Third-Party Licences
Where a Project involves licensing stock assets, fonts, music, or other third-party-owned material, that material remains subject to its original licence terms, and Ordift Studios does not grant rights beyond what it itself holds.

### 8.9 Commercial Licensing Structures

> **[BUSINESS DECISION REQUIRED — REQUIRES QUALIFIED LEGAL REVIEW]**
> **Purpose of this clause:** to define tiered commercial licensing (e.g., different pricing for different usage scopes/durations) if Ordift Studios offers it.
> **Business decisions required:** whether tiered commercial licensing exists as a real offering, and its structure.
> **Why legal review is recommended:** same reasoning as 8.3 — real commercial/financial stakes.

### 8.10 Future NFT / Digital Asset Considerations

> **[BUSINESS DECISION REQUIRED — NOT CURRENTLY ROADMAPPED]**
> **Purpose of this clause:** included per your request for future-proofing, but flagged clearly: **no NFT or digital-asset functionality appears anywhere in `PRODUCT_ROADMAP.md` or the codebase.** This section exists as structural placeholder only, not because it's planned.
> **Business decisions required:** whether this is ever actually pursued; if not, this section can be removed in a future revision rather than carried forward indefinitely.
> **Why legal review is recommended:** N/A until/unless this becomes real.

### 8.11 Future Online Sales

> **[BUSINESS DECISION REQUIRED — NOT CURRENTLY ROADMAPPED]**
> **Purpose of this clause:** same treatment as 8.10 — no online sales/digital-products functionality exists in the codebase or roadmap today; included as structural placeholder only.
> **Business decisions required:** whether this is pursued; if not, remove in a future revision.

---

# Part 9 — AI & Digital Workflow Policy (NEW)

### 9.1 Current Status
As of this version, verified directly against the codebase: **the Site's production systems do not use AI-assisted processing of Personal Data or client information in any automated capacity.** No AI/ML API integration exists anywhere in the platform's dependencies. Any AI-assisted creative work (e.g., a human editor personally using an AI-assisted editing tool outside this platform) is not currently governed by this Site's data flows, since it doesn't touch them.

### 9.2 Human Oversight

> **[BUSINESS DECISION REQUIRED]**
> **Purpose of this clause:** to commit to a human-oversight standard for any future AI-assisted work (editing, transcription, copywriting) Ordift Studios might use.
> **Business decisions required:** the actual oversight standard once any AI tool is adopted — this can't be meaningfully drafted before a specific tool/use case exists.

### 9.3 AI-Assisted Editing

> **[BUSINESS DECISION REQUIRED]**
> **Purpose of this clause:** to disclose if/when AI-assisted editing tools are used on Client Deliverables, and whether Clients are told when this happens.
> **Business decisions required:** whether AI-editing disclosure is offered proactively or only on request.

### 9.4 AI Transcription and AI Copywriting

> **[BUSINESS DECISION REQUIRED]**
> **Purpose of this clause:** same treatment as 9.3, for transcription/copywriting specifically if those become real workflows.

### 9.5 Confidentiality and AI Tools

> **[BUSINESS DECISION REQUIRED — REQUIRES QUALIFIED LEGAL REVIEW]**
> **Purpose of this clause:** to address whether Confidential Information (Part 4.17) could ever be exposed to a third-party AI tool's own data practices, and what commitment Ordift Studios makes about that.
> **Why legal review is recommended:** many AI tools' own terms of service involve using submitted content for their own model training — this needs review against whatever specific tool is eventually adopted, not a generic clause.

### 9.6 Ownership of AI-Assisted Output

> **[BUSINESS DECISION REQUIRED — REQUIRES QUALIFIED LEGAL REVIEW]**
> **Purpose of this clause:** to address IP ownership questions specific to AI-assisted output, which is an unsettled area of law generally, not just for Ordift Studios.
> **Why legal review is recommended:** genuinely emerging/unsettled legal territory as of this version; a placeholder is the honest position here, not a gap in effort.

### 9.7 Client Transparency
Where AI-assisted tools materially affect delivered Creative Works, Ordift Studios' policy commitment (once 9.2–9.4 are resolved) will be reflected here.

### 9.8 Future AI Tools
As AI tools are actually adopted into the platform or workflow, this Part will be updated to name them specifically, consistent with how `TECHNOLOGY_COST_REGISTER.md` tracks new dependencies generally.

---

# Part 10 — Client Portal Terms (NEW)

*Factual/operational sections drafted to production quality from the verified live Client Portal implementation.*

### 10.1 Accounts
Creating an Account requires an email address and password. Passwords are stored securely (hashed, never in plain text) via Supabase Auth, the Portal's authentication provider.

### 10.2 Password Security
You are responsible for keeping your password confidential and for all activity under your Account. A "Forgot password" self-service reset flow is available if you lose access.

### 10.3 Downloads
Deliverables made available to you through the Portal are provided as links to externally-hosted files — the Portal itself does not host or store Deliverable files directly. You are responsible for downloading and independently backing up your own copies once delivered.

### 10.4 Uploads
As of this version, the Client Portal does not support Client file uploads — verified directly against the codebase, not assumed. If upload functionality is added in the future, this section will be updated to describe it and any associated storage/retention terms.

### 10.5 Storage

> **[BUSINESS DECISION REQUIRED]**
> **Purpose of this clause:** to state how long Portal-related data (Account information, Deliverable links, Project history) is retained.
> **Business decisions required:** the retention period, if different from the general retention position in Part 3.9.

### 10.6 Security
The Portal uses row-level security so that each Account can only access its own data — this is a real, verified technical control (Supabase RLS, reviewed and confirmed correct across all Portal-facing tables), not a general assurance.

### 10.7 Deletion
You may request Account deletion at any time by emailing us, consistent with Part 3.10.

### 10.8 Availability

> **[BUSINESS DECISION REQUIRED]**
> **Purpose of this clause:** to state whether any specific uptime commitment applies to the Portal.
> **Business decisions required:** whether an SLA is offered; as of this version, none exists.
> **Why legal review is recommended:** low, unless a specific SLA with financial consequences is desired — that would need review.

### 10.9 Acceptable Use
Use of the Portal is subject to the general Acceptable Use terms in Part 6.2–6.5, applied specifically to the authenticated Portal environment.

---

# Part 11 — Workshop Terms (NEW)

*Factual/operational sections drafted to production quality from the verified live Workshop Platform implementation.*

### 11.1 Registration
Submitting a Workshop Registration reserves your interest in a specific Workshop, subject to capacity. If a Workshop is full, you may be placed on a waiting list — this is real, implemented platform behaviour, not a policy aspiration.

### 11.2 Confirmation
A Registration is not confirmed as a paid place until we have separately confirmed your spot and, where a Workshop requires payment, received that payment through the process agreed with you directly (consistent with Part 4.21 — no online payment exists on the platform as of this version).

### 11.3 Attendance and Behaviour

> **[BUSINESS DECISION REQUIRED]**
> **Purpose of this clause:** to state expected conduct at Workshops and consequences for disruptive behaviour.
> **Business decisions required:** the specific conduct standard and enforcement process.
> **Why legal review is recommended:** low — mostly an operational/code-of-conduct matter.

### 11.4 Recording and Photography

> **[BUSINESS DECISION REQUIRED]**
> **Purpose of this clause:** to state whether Workshops are recorded/photographed, and how attendee Media is handled — this overlaps directly with Part 7's Media Usage & Portfolio Policy.
> **Business decisions required:** same as Part 7.6/7.7 — whether attendee consent is captured, and how.
> **Why legal review is recommended:** cross-reference Part 7's priority-item flag on model releases; Workshop attendees are a specific, recurring category of "models" this applies to.

### 11.5 Certificates
Where a Workshop offers a certificate of completion, this is configured per-Workshop (a real, verified schema field, not aspirational) and described on that Workshop's own page.

### 11.6 Refunds and Cancellation (by Attendee)

> **[BUSINESS DECISION REQUIRED — REQUIRES QUALIFIED LEGAL REVIEW]**
> **Purpose of this clause:** to state the refund/cancellation policy if an attendee cancels their Registration.
> **Business decisions required:** refund window and any fee.
> **Why legal review is recommended:** same reasoning as Part 4.19 — refund-policy enforceability is genuine legal-drafting territory.

### 11.7 Rescheduling and Cancellation (by Ordift Studios)

> **[BUSINESS DECISION REQUIRED]**
> **Purpose of this clause:** to state what happens (refund, transfer, reschedule) if Ordift Studios needs to cancel or reschedule a Workshop (e.g., insufficient registrations, instructor unavailability).
> **Business decisions required:** the specific policy — the Workshop status field (Open for Registration / Coming Soon / Completed) is a real, verified platform mechanism this policy should reference accurately.

### 11.8 Accessibility

> **[BUSINESS DECISION REQUIRED]**
> **Purpose of this clause:** to state Ordift Studios' commitment (if any) to accommodating accessibility needs for Workshop attendees.
> **Business decisions required:** this is as much an operational/venue-accessibility-consultant question as a legal one — flagged accordingly rather than treated as pure legal drafting.
> **Why legal review is recommended:** moderate — depends on applicable accessibility law in the relevant jurisdiction and venue.

### 11.9 Contact
Questions about a specific Workshop Registration should be sent to the contact details listed on our Contact page, consistent with Part 4.23.

---

*End of Ordift Studios Legal Suite v1.0. See `LEGAL_REVIEW_REPORT.md` for the full pre-draft audit, post-draft business protection review, remaining business decisions, and overall readiness score.*
