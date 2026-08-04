import type { LegalDocument, LegalContentNode } from "../types";

// OS-LGL-002 — Cookie Policy, Ordift Studios Enterprise Legal Series.
// Wording transcribed verbatim from the approved source document
// provided 2026-08-04, with three additions the user explicitly
// requested as "Recommended Enhancements... to be done by Claude
// Code": the cookie-categories summary table (Section 4, content given
// verbatim), the Consent Log statement (Section 6, wording given
// verbatim), and the Future-Proofing statement (Section 9, wording
// given verbatim). None of these three invent new facts — they use
// the text supplied directly. Standing Appendices A–G (shared across
// the Enterprise Legal Series) are appended automatically by
// registry.ts's withStandardAppendices(), not duplicated here.

const p = (text: string): LegalContentNode => ({ type: "paragraph", text });
const list = (items: string[], ordered = false): LegalContentNode => ({ type: "list", ordered, items });
const table = (headers: string[], rows: string[][]): LegalContentNode => ({ type: "table", headers, rows });

export const cookiePolicy: LegalDocument = {
  slug: "cookies",
  control: {
    documentTitle: "Cookie Policy",
    documentCode: "OS-LGL-002",
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
      { code: "OS-LGL-003", title: "Website Terms of Use" },
      { code: "OS-LGL-004", title: "Master Booking Terms & Conditions" },
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
  definitions: [],
  sections: [
    {
      id: "introduction",
      number: "1",
      heading: "Introduction",
      level: 1,
      content: [
        p(
          "This Cookie Policy explains how Ordift Studios (“Ordift Studios”, “we”, “our”, or “us”) uses cookies and similar technologies when you visit or interact with our website, client portal, booking systems, workshops, educational platforms, and other digital services."
        ),
        p("This Cookie Policy should be read together with our:"),
        list(["Privacy Policy", "Website Terms of Use", "Booking Terms & Conditions"]),
        p(
          "By continuing to use our website after making your cookie preferences, you acknowledge that cookies may be used in accordance with this Policy."
        ),
      ],
    },
    {
      id: "what-are-cookies",
      number: "2",
      heading: "What Are Cookies?",
      level: 1,
      content: [
        p("Cookies are small text files stored on your device when you visit a website."),
        p("Cookies help websites remember information such as:"),
        list([
          "your preferences;",
          "login status;",
          "security settings;",
          "language selection;",
          "shopping or booking progress;",
          "analytics information; and",
          "website performance.",
        ]),
        p("Cookies do not normally identify you personally by themselves but may be associated with information you provide to us."),
      ],
    },
    {
      id: "why-we-use-cookies",
      number: "3",
      heading: "Why We Use Cookies",
      level: 1,
      content: [
        p("Ordift Studios uses cookies to:"),
        list([
          "keep the website functioning correctly;",
          "improve website performance;",
          "remember your preferences;",
          "secure user accounts;",
          "protect forms against spam and abuse;",
          "understand website traffic;",
          "improve booking experiences;",
          "maintain session security;",
          "detect technical issues; and",
          "continuously improve our services.",
        ]),
        p("We do not use cookies to sell your personal information."),
      ],
    },
    {
      id: "types-of-cookies-we-use",
      number: "4",
      heading: "Types of Cookies We Use",
      level: 1,
      content: [
        p("The table below summarizes the categories of cookies described in this section:"),
        table(
          ["Category", "Purpose", "Required", "Can User Disable?"],
          [
            ["Essential", "Security & core functionality", "Yes", "No"],
            ["Functional", "Preferences", "No", "Yes"],
            ["Analytics", "Performance insights", "No", "Yes"],
            ["Preference", "Personalization", "No", "Yes"],
            ["Marketing (future)", "Promotions", "No", "Yes"],
          ]
        ),
      ],
    },
    {
      id: "essential-cookies",
      number: "A",
      heading: "Essential Cookies",
      level: 2,
      content: [
        p("These cookies are necessary for the operation of the website."),
        p("Without them, important functions such as:"),
        list(["logging in;", "submitting forms;", "completing bookings;", "maintaining secure sessions; and", "accessing the client portal"]),
        p("may not work properly."),
        p("These cookies cannot normally be disabled without affecting website functionality."),
      ],
    },
    {
      id: "functional-cookies",
      number: "B",
      heading: "Functional Cookies",
      level: 2,
      content: [
        p("These cookies remember your choices, including:"),
        list(["language;", "region;", "accessibility preferences;", "previously entered information; and", "user interface preferences."]),
        p("Their purpose is to improve your experience."),
      ],
    },
    {
      id: "performance-analytics-cookies",
      number: "C",
      heading: "Performance & Analytics Cookies",
      level: 2,
      content: [
        p("These cookies help us understand how visitors use the website by collecting information such as:"),
        list([
          "pages visited;",
          "time spent on pages;",
          "navigation paths;",
          "referral sources;",
          "browser types;",
          "device categories; and",
          "general geographic regions.",
        ]),
        p("This information helps us improve our website and services."),
        p("Whenever reasonably possible, analytics data is aggregated or anonymised."),
      ],
    },
    {
      id: "security-cookies",
      number: "D",
      heading: "Security Cookies",
      level: 2,
      content: [
        p("Security cookies help:"),
        list([
          "detect suspicious activity;",
          "prevent fraudulent access;",
          "protect login sessions;",
          "verify requests;",
          "safeguard booking systems; and",
          "support website integrity.",
        ]),
        p("These cookies are essential to maintaining a secure environment."),
      ],
    },
    {
      id: "preference-cookies",
      number: "E",
      heading: "Preference Cookies",
      level: 2,
      content: [
        p("Preference cookies remember settings such as:"),
        list(["accepted cookie preferences;", "preferred contact methods;", "selected booking options; and", "other personalisations."]),
      ],
    },
    {
      id: "future-service-cookies",
      number: "F",
      heading: "Future Service Cookies",
      level: 2,
      content: [
        p("As Ordift Studios expands its services, additional cookies may be introduced to support:"),
        list([
          "workshops;",
          "online learning;",
          "digital downloads;",
          "memberships;",
          "booking enhancements;",
          "customer dashboards;",
          "e-commerce functionality; and",
          "other future digital services.",
        ]),
        p("Where required, this Cookie Policy will be updated to reflect any material changes."),
      ],
    },
    {
      id: "third-party-technologies",
      number: "5",
      heading: "Third-Party Technologies",
      level: 1,
      content: [
        p("Ordift Studios may use trusted third-party providers to support website functionality."),
        p("These providers may set cookies necessary for services such as:"),
        list([
          "website security;",
          "spam prevention;",
          "payment processing;",
          "booking systems;",
          "analytics;",
          "customer communications;",
          "embedded media; and",
          "cloud infrastructure.",
        ]),
        p("We encourage users to review the privacy and cookie policies of relevant third-party providers where appropriate."),
      ],
    },
    {
      id: "cookie-consent",
      number: "6",
      heading: "Cookie Consent",
      level: 1,
      content: [
        p("Where required by applicable law, visitors will be presented with a cookie consent banner when first visiting our website."),
        p("You may choose to:"),
        list(["Accept all cookies;", "Reject non-essential cookies; or", "Customise your cookie preferences."]),
        p("Your choices will be respected and remembered where technically possible."),
        p(
          "Where legally required, Ordift Studios records users' cookie consent preferences to demonstrate compliance and to allow those preferences to be honoured on future visits."
        ),
      ],
    },
    {
      id: "managing-cookies",
      number: "7",
      heading: "Managing Cookies",
      level: 1,
      content: [
        p("Most web browsers allow you to:"),
        list([
          "view stored cookies;",
          "delete cookies;",
          "block cookies;",
          "receive notifications before cookies are stored; and",
          "configure cookie preferences.",
        ]),
        p("Please note that disabling certain cookies may affect the functionality of parts of our website."),
      ],
    },
    {
      id: "cookie-retention",
      number: "8",
      heading: "Cookie Retention",
      level: 1,
      content: [
        p("Different cookies remain on your device for different periods."),
        p(
          "Some are deleted when you close your browser (Session Cookies), while others remain until they expire or are manually deleted (Persistent Cookies)."
        ),
        p("Retention periods vary depending on their purpose."),
      ],
    },
    {
      id: "updates-to-this-policy",
      number: "9",
      heading: "Updates to This Policy",
      level: 1,
      content: [
        p("We may update this Cookie Policy from time to time to reflect:"),
        list(["legal changes;", "operational improvements;", "technology updates;", "website enhancements; or", "new services."]),
        p("The latest version will always be available on our website."),
        p(
          "New technologies that serve a similar purpose to the cookies described in this Policy may be used in the future and will be governed by this Cookie Policy, unless a separate notice is provided."
        ),
      ],
    },
    {
      id: "contact-us",
      number: "10",
      heading: "Contact Us",
      level: 1,
      content: [
        p("If you have any questions about our use of cookies or similar technologies, please contact:"),
        p("Ordift Studios"),
        p("Head Office: Accra, Ghana"),
        p("Regional Operations: Doha, Qatar"),
        p("Email: info@ordiftstudios.com"),
        p("General Enquiries: enquiry@ordiftstudios.com"),
        p("Website: ordiftstudios.com"),
      ],
    },
  ],
};
