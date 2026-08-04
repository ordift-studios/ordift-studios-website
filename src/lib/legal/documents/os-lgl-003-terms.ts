import type { LegalDocument, LegalContentNode } from "../types";

// OS-LGL-003 — Website Terms of Use, Ordift Studios Enterprise Legal
// Series. Wording transcribed verbatim from the approved source
// document provided 2026-08-04. Sections 22-25 (Accessibility
// Commitment, Electronic Communications, Force Majeure, Severability &
// Entire Agreement) were requested as additional inclusions in the same
// message and are drafted from the descriptions given, using the same
// conservative, non-specific language discipline as OS-LGL-001's
// Appendices E-G (see TECHNICAL_DEBT_REGISTER.md TD-021) — no
// certifications, procedures, or specific facts beyond what was
// supplied. Section 25's heading and content follow the user's own
// wording exactly, including "Severability" — note this necessarily
// overlaps with the shared Appendix A (Interpretation and Severability,
// see ../boilerplate.ts) that every document in the series already
// inherits via withStandardAppendices(); left in deliberately rather
// than silently trimmed, since it's harmless procedural redundancy, not
// a factual conflict, and the user's wording was explicit. Flagged to
// the user rather than resolved unilaterally.

const p = (text: string): LegalContentNode => ({ type: "paragraph", text });
const list = (items: string[], ordered = false): LegalContentNode => ({ type: "list", ordered, items });

export const websiteTerms: LegalDocument = {
  slug: "terms",
  control: {
    documentTitle: "Website Terms of Use",
    documentCode: "OS-LGL-003",
    publicationSeries: "Ordift Studios Enterprise Legal Series (OSELS)",
    version: "1.0",
    status: "approved",
    classification: "public",
    effectiveDate: "2026-08-05",
    lastUpdated: "2026-08-05",
    reviewCycle: "Every 12 Months or Earlier if Required",
    documentOwner: "Ordift Studios",
    preparedBy: "Ordift Studios",
    approvedBy: "Management",
    relatedDocuments: [
      { code: "OS-LGL-000", title: "Master Definitions Register" },
      { code: "OS-LGL-001", title: "Privacy Policy" },
      { code: "OS-LGL-002", title: "Cookie Policy" },
      { code: "OS-LGL-004", title: "Master Booking Terms & Conditions" },
      { code: null, title: "Future Intellectual Property Policy" },
    ],
    controlledDocumentNotice:
      "This document forms part of the Ordift Studios Enterprise Legal Series. Only the latest approved version published by Ordift Studios shall be regarded as the official version. Printed or downloaded copies are considered uncontrolled copies unless otherwise marked.",
    changeLog: [
      {
        version: "1.0",
        date: "2026-08-05",
        description: "Initial approved publication.",
        author: "Ordift Studios",
      },
    ],
  },
  definitions: [
    {
      id: "website",
      term: "Website",
      definition: "means the Ordift Studios website and all associated web applications, portals, and online services.",
    },
    {
      id: "services",
      term: "Services",
      definition:
        "means any photography, videography, creative production, consultancy, workshops, educational offerings, digital products, or other services provided by Ordift Studios.",
    },
    {
      id: "client",
      term: "Client",
      definition: "means any individual or organisation engaging or intending to engage Ordift Studios.",
    },
    {
      id: "user",
      term: "User",
      definition: "means any person who visits, browses, or interacts with the website.",
    },
    {
      id: "creative-works",
      term: "Creative Works",
      definition:
        "means photographs, videos, graphics, artwork, designs, audio, documents, and other original works produced by Ordift Studios.",
    },
  ],
  sections: [
    {
      id: "acceptance-of-these-terms",
      number: "1",
      heading: "Acceptance of These Terms",
      level: 1,
      content: [
        p(
          "By accessing or using the Ordift Studios website, you agree to be bound by these Website Terms of Use and all other policies referenced within them, including the Privacy Policy, Cookie Policy, Booking Terms & Conditions, and any additional policies applicable to specific services."
        ),
        p("If you do not agree to these Terms, you must discontinue use of the website."),
      ],
    },
    {
      id: "definitions",
      number: "2",
      heading: "Definitions",
      level: 1,
      content: [
        p("For these Terms:"),
        p(
          "Terms defined below are specific to this document. Ordift Studios maintains a Master Definitions Register (OS-LGL-000) across the Enterprise Legal Series; where a term used in these Terms is not defined below, its meaning in the Master Definitions Register applies."
        ),
      ],
    },
    {
      id: "eligibility-to-use-the-website",
      number: "3",
      heading: "Eligibility to Use the Website",
      level: 1,
      content: [
        p("You represent that:"),
        list([
          "you are legally capable of entering into binding agreements in your jurisdiction; or",
          "if you are under the age of majority, you have the permission and supervision of a parent or legal guardian where required.",
        ]),
        p("Certain services may have additional eligibility requirements."),
      ],
    },
    {
      id: "scope-of-services",
      number: "4",
      heading: "Scope of Services",
      level: 1,
      content: [
        p("The website provides information and access to services offered by Ordift Studios, including but not limited to:"),
        list([
          "Photography",
          "Videography",
          "Creative Production",
          "Commercial Projects",
          "Events",
          "Weddings",
          "Portrait Sessions",
          "Workshops",
          "Creative Education",
          "Consulting",
          "Talent Development",
          "Digital Products",
          "Future creative and media-related services",
        ]),
        p("Availability of specific services may vary by location or over time."),
      ],
    },
    {
      id: "website-availability",
      number: "5",
      heading: "Website Availability",
      level: 1,
      content: [
        p("We strive to keep the website available and functioning reliably. However, we do not guarantee uninterrupted or error-free access."),
        p(
          "Ordift Studios may suspend, modify, or discontinue any part of the website for maintenance, upgrades, security, legal compliance, or operational reasons without prior notice where reasonably necessary."
        ),
      ],
    },
    {
      id: "user-accounts",
      number: "6",
      heading: "User Accounts",
      level: 1,
      content: [
        p("Certain features may require the creation of a user account."),
        p("You are responsible for:"),
        list([
          "maintaining the confidentiality of your login credentials;",
          "ensuring information provided is accurate and current;",
          "all activities carried out under your account; and",
          "notifying Ordift Studios promptly of any suspected unauthorised use.",
        ]),
        p("We reserve the right to suspend or terminate accounts where these Terms are breached or where security concerns arise."),
      ],
    },
    {
      id: "acceptable-use",
      number: "7",
      heading: "Acceptable Use",
      level: 1,
      content: [
        p("You agree to use the website lawfully, responsibly, and respectfully."),
        p("You must not use the website in a way that:"),
        list([
          "interferes with its operation;",
          "infringes the rights of others;",
          "compromises security;",
          "violates applicable laws; or",
          "damages the reputation of Ordift Studios.",
        ]),
      ],
    },
    {
      id: "prohibited-conduct",
      number: "8",
      heading: "Prohibited Conduct",
      level: 1,
      content: [
        p("You must not:"),
        list([
          "upload malicious software or code;",
          "attempt unauthorised access;",
          "bypass security measures;",
          "interfere with website functionality;",
          "scrape or systematically extract website content without written permission;",
          "impersonate another person or organisation;",
          "submit false bookings or fraudulent enquiries;",
          "use automated tools to abuse forms or services;",
          "infringe copyright or intellectual property rights;",
          "use the website for unlawful, abusive, defamatory, discriminatory, or harmful purposes.",
        ]),
        p("Ordift Studios reserves the right to investigate suspected misuse and take appropriate action."),
      ],
    },
    {
      id: "intellectual-property",
      number: "9",
      heading: "Intellectual Property",
      level: 1,
      content: [
        p(
          "Unless otherwise stated, all content available on the website—including photographs, videos, graphics, logos, branding, text, layouts, software, downloadable materials, and Creative Works—is owned by or licensed to Ordift Studios and is protected by applicable intellectual property laws."
        ),
        p("Nothing in these Terms grants ownership or intellectual property rights to users."),
        p(
          "Detailed provisions regarding ownership, licensing, copyright, and permitted use of Creative Works are governed by the Intellectual Property Policy and applicable service agreements."
        ),
      ],
    },
    {
      id: "user-generated-content",
      number: "10",
      heading: "User-Generated Content",
      level: 1,
      content: [
        p(
          "Where users submit content—such as enquiry forms, testimonials, reviews, applications, workshop submissions, or uploaded files—they confirm that:"
        ),
        list([
          "they have the necessary rights to submit the content;",
          "the content does not infringe the rights of others;",
          "the content is accurate to the best of their knowledge; and",
          "the content does not contain unlawful, offensive, or harmful material.",
        ]),
        p("Ordift Studios may remove content that breaches these Terms."),
      ],
    },
    {
      id: "booking-and-service-requests",
      number: "11",
      heading: "Booking & Service Requests",
      level: 1,
      content: [
        p("Submitting an enquiry, quotation request, or booking request through the website does not create a binding contract."),
        p(
          "A binding agreement is formed only after Ordift Studios confirms acceptance in accordance with the applicable Booking Terms & Conditions or a signed service agreement."
        ),
      ],
    },
    {
      id: "third-party-services-and-links",
      number: "12",
      heading: "Third-Party Services & Links",
      level: 1,
      content: [
        p("The website may contain links to third-party websites or integrate third-party services."),
        p(
          "Ordift Studios is not responsible for the content, privacy practices, availability, or policies of external websites or services that are not under our control."
        ),
      ],
    },
    {
      id: "ai-and-digital-services",
      number: "13",
      heading: "AI & Digital Services",
      level: 1,
      content: [
        p(
          "Ordift Studios may use artificial intelligence, automation, and digital technologies to enhance website functionality, customer service, administrative efficiency, and creative workflows."
        ),
        p("These technologies are intended to support—not replace—professional human judgment."),
        p("Where AI-assisted services materially affect client deliverables, they will be used responsibly and subject to appropriate quality control."),
      ],
    },
    {
      id: "disclaimers",
      number: "14",
      heading: "Disclaimers",
      level: 1,
      content: [
        p("The website and its content are provided on an “as available” and “as is” basis."),
        p("While we strive for accuracy, we do not warrant that:"),
        list([
          "all information is complete or current;",
          "the website will always be uninterrupted or error-free;",
          "all content will remain available indefinitely; or",
          "the website will be free from security risks beyond our reasonable control.",
        ]),
        p("Nothing in this section excludes rights that cannot be excluded under applicable law."),
      ],
    },
    {
      id: "limitation-of-liability",
      number: "15",
      heading: "Limitation of Liability",
      level: 1,
      content: [
        p(
          "To the maximum extent permitted by applicable law, Ordift Studios shall not be liable for indirect, incidental, consequential, special, exemplary, or punitive damages arising from the use of—or inability to use—the website."
        ),
        p("Nothing in these Terms limits liability where such limitation is prohibited by law."),
      ],
    },
    {
      id: "indemnification",
      number: "16",
      heading: "Indemnification",
      level: 1,
      content: [
        p(
          "You agree to indemnify and hold harmless Ordift Studios, its directors, officers, employees, contractors, and authorised representatives from claims, losses, damages, liabilities, costs, or expenses arising from your breach of these Terms or misuse of the website, to the extent permitted by applicable law."
        ),
      ],
    },
    {
      id: "suspension-and-termination",
      number: "17",
      heading: "Suspension & Termination",
      level: 1,
      content: [
        p("Ordift Studios may suspend or terminate access to the website or user accounts where reasonably necessary, including in cases of:"),
        list([
          "breaches of these Terms;",
          "suspected fraud;",
          "security risks;",
          "unlawful activity; or",
          "protection of the rights, property, or safety of Ordift Studios, its clients, or other users.",
        ]),
      ],
    },
    {
      id: "changes-to-the-website",
      number: "18",
      heading: "Changes to the Website",
      level: 1,
      content: [
        p(
          "We may modify, expand, redesign, replace, or discontinue any feature or service offered through the website without creating an obligation to continue providing a particular feature indefinitely."
        ),
      ],
    },
    {
      id: "governing-law-and-jurisdiction",
      number: "19",
      heading: "Governing Law & Jurisdiction",
      level: 1,
      content: [
        p("These Terms shall be interpreted in accordance with the laws applicable to the operations of Ordift Studios."),
        p(
          "Where a specific service agreement identifies a governing law or dispute resolution process, that agreement will prevail for matters relating to that engagement."
        ),
        p("Nothing in these Terms limits any non-excludable rights available under applicable law."),
      ],
    },
    {
      id: "changes-to-these-terms",
      number: "20",
      heading: "Changes to These Terms",
      level: 1,
      content: [
        p("We may revise these Website Terms of Use periodically."),
        p(
          "Material changes will be published on the website with an updated “Last Updated” date. Continued use of the website after those changes take effect constitutes acceptance of the revised Terms, where permitted by applicable law."
        ),
      ],
    },
    {
      id: "contact-information",
      number: "21",
      heading: "Contact Information",
      level: 1,
      content: [
        p("Ordift Studios"),
        p("Head Office: Accra, Ghana"),
        p("Regional Office: Doha, Qatar"),
        p("Email: info@ordiftstudios.com"),
        p("General Enquiries: enquiry@ordiftstudios.com"),
        p("Website: ordiftstudios.com"),
      ],
    },
    {
      id: "accessibility-commitment",
      number: "22",
      heading: "Accessibility Commitment",
      level: 1,
      content: [
        p("Ordift Studios aims to make this website accessible to all users, including users with disabilities."),
        p("If you experience any difficulty accessing content or functionality on this website, we welcome your feedback so that we can work to address it."),
      ],
    },
    {
      id: "electronic-communications",
      number: "23",
      heading: "Electronic Communications",
      level: 1,
      content: [
        p(
          "By using this website, you agree to receive electronic communications from Ordift Studios relating to enquiries, bookings, and account activity."
        ),
        p("Marketing communications are separate and remain subject to your consent, which you may withdraw at any time."),
      ],
    },
    {
      id: "force-majeure",
      number: "24",
      heading: "Force Majeure",
      level: 1,
      content: [
        p(
          "Ordift Studios will not be responsible for delays or failures in performance caused by events beyond its reasonable control, including but not limited to natural disasters, government actions, internet or network outages, or similar events."
        ),
      ],
    },
    {
      id: "severability-and-entire-agreement",
      number: "25",
      heading: "Severability & Entire Agreement",
      level: 1,
      content: [
        p("If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in effect."),
        p(
          "These Terms, together with the referenced policies, form the complete agreement governing use of the website, unless a separate written agreement applies."
        ),
      ],
    },
  ],
};
