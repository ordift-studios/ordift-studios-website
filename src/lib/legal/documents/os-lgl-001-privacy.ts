import type { LegalDocument, LegalContentNode } from "../types";

// OS-LGL-001 — Privacy Policy, Ordift Studios Enterprise Legal Series.
// Wording transcribed verbatim from the approved source document
// provided 2026-08-04. Do not edit prose here without a fresh approved
// source — see TECHNICAL_DEBT_REGISTER.md / TECHNICAL_DECISION_RECORDS.md
// for why this lives in code rather than the Sanity `legalPage` type.

const p = (text: string): LegalContentNode => ({ type: "paragraph", text });
const list = (items: string[], ordered = false): LegalContentNode => ({ type: "list", ordered, items });
const sub = (text: string): LegalContentNode => ({ type: "subheading", text });
const table = (headers: string[], rows: string[][]): LegalContentNode => ({ type: "table", headers, rows });

export const privacyPolicy: LegalDocument = {
  slug: "privacy",
  control: {
    documentTitle: "Privacy Policy",
    documentCode: "OS-LGL-001",
    publicationSeries: "Ordift Studios Enterprise Legal Series (OSELS)",
    version: "1.2",
    status: "approved",
    classification: "public",
    effectiveDate: "2026-08-05",
    lastUpdated: "2026-08-04",
    reviewCycle: "Every 12 Months or Earlier if Required",
    documentOwner: "Ordift Studios",
    preparedBy: "Ordift Studios",
    approvedBy: "Management",
    relatedDocuments: [
      { code: "OS-LGL-000", title: "Master Definitions Register" },
      { code: "OS-LGL-002", title: "Cookie Policy" },
      { code: "OS-LGL-003", title: "Website Terms of Use" },
      { code: "OS-LGL-004", title: "Master Booking Terms & Conditions" },
      { code: null, title: "Future Intellectual Property Policy" },
      { code: null, title: "Future AI & Digital Workflow Policy" },
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
      {
        version: "1.1",
        date: "2026-08-04",
        description:
          "Added standing Appendices (Interpretation & Severability, Accessibility Commitment, Contact Escalation Procedure, Cross-Document Hierarchy); linked defined terms to the Definitions section throughout; reframed Section 2 to reference the Master Definitions Register (OS-LGL-000); introduced a running change log in place of a single revision row. No changes to the substantive privacy-practice wording approved in Version 1.0.",
        author: "Ordift Studios",
      },
      {
        version: "1.2",
        date: "2026-08-04",
        description:
          "Refactored Appendices A–D into shared Enterprise Legal Series boilerplate (applied automatically to every document, not duplicated per document); added Appendix E (Jurisdiction-Specific Data Protection Addendum), Appendix F (Government and Law Enforcement Requests), and Appendix G (Data Breach Response Summary), drafted using deliberately conservative, non-specific language — no certifications, registrations, or internal procedures are asserted. No changes to the substantive privacy-practice wording approved in Version 1.0.",
        author: "Ordift Studios",
      },
    ],
  },
  definitions: [
    {
      id: "personal-information",
      term: "Personal Information",
      definition: "means any information relating to an identified or identifiable individual.",
    },
    {
      id: "client",
      term: "Client",
      definition:
        "means any individual, organization, company, institution, or representative who enquires about or receives services from Ordift Studios.",
    },
    {
      id: "creative-works",
      term: "Creative Works",
      definition:
        "means photographs, videos, audio recordings, graphics, designs, edited media, production files, digital assets, documents, and other materials created during the provision of services.",
    },
    {
      id: "services",
      term: "Services",
      definition:
        "refers to all services provided by Ordift Studios, including photography, videography, creative direction, editing, consultancy, education, workshops, digital products, branding, and any future services offered by the business.",
    },
    {
      id: "website",
      term: "Website",
      definition:
        "means the official Ordift Studios website and any authorized subdomains, client portals, booking systems, educational platforms, mobile applications, or digital services operated by Ordift Studios.",
    },
    {
      id: "third-party-provider",
      term: "Third-Party Provider",
      definition:
        "means any trusted external organization engaged to assist Ordift Studios in providing its services, including cloud hosting providers, payment processors, communication platforms, analytics providers, scheduling systems, and similar service providers.",
    },
    {
      id: "applicable-law",
      term: "Applicable Law",
      definition:
        "means the laws, regulations, and legal requirements that govern the processing of personal information in the jurisdictions relevant to the services provided by Ordift Studios.",
    },
  ],
  sections: [
    {
      id: "introduction",
      number: "1",
      heading: "Introduction",
      level: 1,
      content: [
        p("Welcome to Ordift Studios."),
        p(
          "Ordift Studios (“Ordift Studios”, “we”, “our”, or “us”) is a multidisciplinary creative studio providing photography, videography, creative production, creative direction, digital media, workshops, consultancy, educational programmes, branding, content production, and related creative services to individuals, businesses, organisations, and institutions in Ghana, Qatar, and internationally."
        ),
        p(
          "This Privacy Policy explains how Ordift Studios collects, uses, stores, protects, processes, transfers, and otherwise handles personal information whenever you:"
        ),
        list([
          "visit our website;",
          "request information;",
          "submit an enquiry;",
          "request a quotation;",
          "book our services;",
          "create a client account;",
          "participate in workshops or educational programmes;",
          "purchase digital products or services;",
          "communicate with us through any authorized channel; or",
          "otherwise interact with Ordift Studios.",
        ]),
        p(
          "Our objective is not only to comply with applicable privacy requirements but also to maintain the trust placed in us by every client, collaborator, student, supplier, employee, volunteer, contractor, and visitor."
        ),
        p(
          "By accessing our website or using our services, you acknowledge that you have read, understood, and accepted this Privacy Policy."
        ),
      ],
    },
    {
      id: "definitions",
      number: "2",
      heading: "Definitions",
      level: 1,
      content: [
        p("For the purposes of this Privacy Policy:"),
        p(
          "Terms defined below are specific to this document. Ordift Studios maintains a Master Definitions Register (OS-LGL-000) across the Enterprise Legal Series; where a term used in this Privacy Policy is not defined below, its meaning in the Master Definitions Register applies."
        ),
      ],
    },
    {
      id: "who-we-are",
      number: "3",
      heading: "Who We Are",
      level: 1,
      content: [
        p(
          "Ordift Studios (“Ordift Studios”, “we”, “our”, or “us”) is a creative media and digital services company providing professional photography, videography, creative direction, branding, digital production, consultancy, education, media training, and related creative solutions."
        ),
        p(
          "Our services are offered to private individuals, businesses, organizations, educational institutions, government entities, churches, non-profit organizations, and commercial clients within Ghana, Qatar, and other jurisdictions where our services may lawfully be provided."
        ),
        p(
          "As our business evolves, we may introduce additional services, platforms, technologies, or business divisions. Unless expressly stated otherwise, this Privacy Policy applies to all such services."
        ),
        p("Our official contact details are provided in the Contact Information section of this document."),
      ],
    },
    {
      id: "scope-of-this-privacy-policy",
      number: "4",
      heading: "Scope of this Privacy Policy",
      level: 1,
      content: [
        p(
          "This Privacy Policy governs the collection, use, storage, disclosure, transfer, retention, and protection of personal information obtained through our business operations."
        ),
        p("It applies whenever you:"),
        list([
          "visit or browse our website;",
          "submit an enquiry or contact request;",
          "complete a booking or consultation request;",
          "request quotations or proposals;",
          "purchase products or services;",
          "attend workshops, seminars, training sessions, or educational programmes;",
          "subscribe to newsletters or marketing communications;",
          "participate in competitions, promotions, surveys, or community initiatives;",
          "communicate with us by email, telephone, messaging applications, social media, or any other authorised communication channel;",
          "interact with our client portals or digital platforms; or",
          "otherwise engage with Ordift Studios in any professional capacity.",
        ]),
        p(
          "This Privacy Policy also applies to information collected through both online and offline interactions, including information obtained during consultations, production meetings, events, commercial assignments, educational programmes, exhibitions, networking engagements, and other legitimate business activities."
        ),
        p(
          "Unless expressly stated, this Privacy Policy does not apply to third-party websites, applications, platforms, or services that are not owned or controlled by Ordift Studios, even where links to such services are provided through our website."
        ),
      ],
    },
    {
      id: "information-we-collect",
      number: "5",
      heading: "Information We Collect",
      level: 1,
      content: [
        p(
          "To provide our services effectively, we may collect various categories of personal and business information depending on the nature of your interaction with us."
        ),
      ],
    },
    {
      id: "personal-identification-information",
      number: "5.1",
      heading: "Personal Identification Information",
      level: 2,
      content: [
        p("This may include:"),
        list([
          "Full name",
          "Preferred name",
          "Date of birth (where relevant)",
          "Gender (where voluntarily provided)",
          "Nationality (where required)",
          "Government-issued identification details (only where legally required)",
          "Passport information (where necessary for specific assignments or travel-related services)",
        ]),
      ],
    },
    {
      id: "contact-information-collected",
      number: "5.2",
      heading: "Contact Information",
      level: 2,
      content: [
        p("This may include:"),
        list([
          "Email address",
          "Telephone numbers",
          "WhatsApp number",
          "Postal address",
          "Residential address",
          "Business address",
          "Social media usernames",
          "Preferred communication methods",
        ]),
      ],
    },
    {
      id: "booking-and-client-information",
      number: "5.3",
      heading: "Booking and Client Information",
      level: 2,
      content: [
        p("When engaging our services, we may collect information relating to:"),
        list([
          "Event details",
          "Venue information",
          "Production schedules",
          "Preferred dates",
          "Budget ranges",
          "Service selections",
          "Client questionnaires",
          "Project requirements",
          "Creative briefs",
          "Mood boards",
          "Brand guidelines",
          "Special requests",
          "Accessibility requirements",
        ]),
      ],
    },
    {
      id: "payment-information",
      number: "5.4",
      heading: "Payment Information",
      level: 2,
      content: [
        p("Where applicable, we may collect information necessary to process payments, including:"),
        list([
          "Billing name",
          "Billing address",
          "Payment confirmations",
          "Transaction references",
          "Invoice details",
          "Tax-related information",
        ]),
        p(
          "Ordift Studios does not store complete payment card information on its own systems. Payments are processed through trusted third-party payment providers operating under their own privacy and security standards."
        ),
      ],
    },
    {
      id: "media-and-creative-content",
      number: "5.5",
      heading: "Media and Creative Content",
      level: 2,
      content: [
        p("Depending on the services requested, we may collect or create:"),
        list([
          "Photographs",
          "Video recordings",
          "Audio recordings",
          "Drone imagery (where legally permitted)",
          "Digital artwork",
          "Graphic designs",
          "Production files",
          "Edited deliverables",
          "Raw media files",
          "Creative project documentation",
        ]),
        p(
          "Such materials may include identifiable individuals and therefore may constitute personal information under applicable privacy laws."
        ),
      ],
    },
    {
      id: "technical-information",
      number: "5.6",
      heading: "Technical Information",
      level: 2,
      content: [
        p("When you use our website or digital platforms, certain technical information may be collected automatically, including:"),
        list([
          "IP address",
          "Browser type and version",
          "Device information",
          "Operating system",
          "Language preferences",
          "Referral URLs",
          "Pages visited",
          "Time spent on pages",
          "Session information",
          "Crash reports",
          "Website interaction data",
        ]),
      ],
    },
    {
      id: "cookies-and-similar-technologies",
      number: "5.7",
      heading: "Cookies and Similar Technologies",
      level: 2,
      content: [
        p("We use cookies and similar technologies to:"),
        list([
          "remember user preferences;",
          "improve website functionality;",
          "analyze website traffic;",
          "enhance user experience;",
          "support website security;",
          "personalize certain features; and",
          "measure marketing effectiveness.",
        ]),
        p("Further details are provided in our Cookie Policy (OS-LGL-002)."),
      ],
    },
    {
      id: "communications",
      number: "5.8",
      heading: "Communications",
      level: 2,
      content: [
        p("We retain records of communications exchanged with Ordift Studios, including:"),
        list([
          "emails;",
          "enquiry forms;",
          "WhatsApp messages;",
          "SMS messages;",
          "social media messages;",
          "customer support requests;",
          "consultation notes; and",
          "correspondence necessary for service delivery or legal compliance.",
        ]),
      ],
    },
    {
      id: "information-provided-voluntarily",
      number: "5.9",
      heading: "Information Provided Voluntarily",
      level: 2,
      content: [
        p(
          "You may voluntarily provide additional information to us during enquiries, consultations, interviews, applications, workshops, collaborative projects, competitions, educational programmes, surveys, or testimonials."
        ),
        p("Providing such information is entirely voluntary unless required to fulfill a contractual or legal obligation."),
      ],
    },
    {
      id: "how-we-collect-information",
      number: "6",
      heading: "How We Collect Information",
      level: 1,
      content: [
        p("Ordift Studios collects personal information through lawful, transparent, and fair means."),
        p("Information may be collected:"),
        sub("Directly from you"),
        p("Including when you:"),
        list([
          "complete forms;",
          "make bookings;",
          "request quotations;",
          "purchase services;",
          "contact us;",
          "subscribe to newsletters;",
          "attend consultations;",
          "participate in workshops;",
          "complete questionnaires; or",
          "otherwise communicate with us.",
        ]),
        sub("Automatically"),
        p(
          "Through cookies, analytics technologies, server logs, website functionality, and similar digital technologies used to operate and improve our online services."
        ),
        sub("Through Third Parties"),
        p("Where legally permitted, we may receive information from trusted third-party providers, including:"),
        list([
          "payment processors;",
          "booking platforms;",
          "marketing service providers;",
          "analytics providers;",
          "social media platforms;",
          "referral partners;",
          "authorized representatives; and",
          "publicly available sources where relevant to our legitimate business activities.",
        ]),
        p("Where personal information is received from third parties, we will process it in accordance with this Privacy Policy and applicable laws."),
      ],
    },
    {
      id: "how-we-use-your-information",
      number: "7",
      heading: "How We Use Your Information",
      level: 1,
      content: [
        p(
          "Ordift Studios processes personal information only for legitimate business purposes and in accordance with applicable laws. The information we collect enables us to deliver high-quality creative services, maintain effective communication, improve our operations, and fulfil our legal and contractual obligations."
        ),
        p("Depending on your interaction with us, we may use your information for one or more of the following purposes."),
      ],
    },
    {
      id: "service-delivery-use",
      number: "7.1",
      heading: "Service Delivery",
      level: 2,
      content: [
        p("We use personal information to:"),
        list([
          "process enquiries and booking requests;",
          "prepare quotations and proposals;",
          "schedule appointments, consultations, productions, and events;",
          "deliver photography, videography, branding, consultancy, educational, and creative services;",
          "manage projects from commencement through completion;",
          "provide client support before, during, and after service delivery;",
          "fulfill contractual obligations; and",
          "manage ongoing client relationships.",
        ]),
      ],
    },
    {
      id: "communication-use",
      number: "7.2",
      heading: "Communication",
      level: 2,
      content: [
        p("We use your information to communicate with you regarding:"),
        list([
          "bookings;",
          "appointments;",
          "project updates;",
          "invoices;",
          "payments;",
          "contractual matters;",
          "production schedules;",
          "revisions;",
          "technical support;",
          "customer service enquiries; and",
          "important notices affecting our services.",
        ]),
        p(
          "Communication may occur through email, telephone, SMS, WhatsApp, client portals, video conferencing platforms, or other authorised communication channels."
        ),
      ],
    },
    {
      id: "business-administration-use",
      number: "7.3",
      heading: "Business Administration",
      level: 2,
      content: [
        p("Personal information may also be processed to:"),
        list([
          "maintain client records;",
          "manage internal administration;",
          "generate invoices and financial records;",
          "maintain accounting records;",
          "perform internal audits;",
          "prevent fraud;",
          "resolve disputes;",
          "enforce agreements;",
          "manage insurance matters where applicable; and",
          "comply with regulatory obligations.",
        ]),
      ],
    },
    {
      id: "website-improvement-use",
      number: "7.4",
      heading: "Website Improvement",
      level: 2,
      content: [
        p("Information collected through our website may be used to:"),
        list([
          "improve website functionality;",
          "enhance user experience;",
          "analyse visitor behaviour;",
          "optimise website performance;",
          "identify technical issues;",
          "improve accessibility;",
          "evaluate content effectiveness; and",
          "develop new website features.",
        ]),
      ],
    },
    {
      id: "marketing-and-business-development-use",
      number: "7.5",
      heading: "Marketing and Business Development",
      level: 2,
      content: [
        p("Where permitted by law or with your consent where required, we may use your information to:"),
        list([
          "send newsletters;",
          "announce new services;",
          "share educational content;",
          "invite participation in workshops or events;",
          "distribute promotional materials;",
          "provide updates regarding Ordift Studios; and",
          "inform you of opportunities that may be relevant to your interests.",
        ]),
        p("You may unsubscribe from marketing communications at any time without affecting communications necessary for service delivery."),
      ],
    },
    {
      id: "security-and-risk-management-use",
      number: "7.6",
      heading: "Security and Risk Management",
      level: 2,
      content: [
        p("We process personal information to:"),
        list([
          "protect our systems;",
          "detect fraudulent activities;",
          "investigate misuse of our services;",
          "maintain cybersecurity;",
          "prevent unauthorized access;",
          "protect intellectual property;",
          "safeguard our staff, clients, and contractors; and",
          "ensure the integrity of our business operations.",
        ]),
      ],
    },
    {
      id: "research-analytics-and-service-development",
      number: "7.7",
      heading: "Research, Analytics, and Service Development",
      level: 2,
      content: [
        p("We may analyze information to:"),
        list([
          "understand client needs;",
          "improve creative workflows;",
          "develop new services;",
          "evaluate business performance;",
          "improve educational programmes;",
          "conduct statistical analysis; and",
          "support strategic planning.",
        ]),
        p("Where reasonably possible, information used for analytics will be aggregated or anonymized."),
      ],
    },
    {
      id: "legal-basis-for-processing",
      number: "8",
      heading: "Legal Basis for Processing",
      level: 1,
      content: [
        p("Where applicable privacy laws require a legal basis for processing personal information, Ordift Studios relies on one or more of the following grounds."),
      ],
    },
    {
      id: "contractual-necessity",
      number: "8.1",
      heading: "Contractual Necessity",
      level: 2,
      content: [
        p("Processing is necessary to:"),
        list(["provide requested services;", "fulfil contractual obligations;", "manage bookings;", "prepare deliverables;", "provide customer support; and", "administer ongoing projects."]),
      ],
    },
    {
      id: "consent",
      number: "8.2",
      heading: "Consent",
      level: 2,
      content: [
        p(
          "We rely on your consent where appropriate, including for certain marketing communications, optional surveys, testimonials, portfolio permissions, and any other processing activities that require consent under applicable law."
        ),
        p("Where processing is based on consent, you may withdraw that consent at any time. Withdrawal will not affect the lawfulness of processing carried out before the withdrawal."),
      ],
    },
    {
      id: "legal-obligations",
      number: "8.3",
      heading: "Legal Obligations",
      level: 2,
      content: [
        p("Certain information may be processed to comply with applicable legal requirements, including:"),
        list(["taxation;", "accounting;", "financial reporting;", "anti-fraud measures;", "court orders;", "regulatory investigations; and", "other lawful governmental requirements."]),
      ],
    },
    {
      id: "legitimate-interests",
      number: "8.4",
      heading: "Legitimate Interests",
      level: 2,
      content: [
        p("Ordift Studios may process information where necessary for legitimate business interests, provided those interests do not override your fundamental rights and freedoms."),
        p("Legitimate interests may include:"),
        list([
          "improving services;",
          "maintaining business records;",
          "protecting business assets;",
          "preventing fraud;",
          "securing digital systems;",
          "managing client relationships;",
          "improving customer experience; and",
          "operating our business efficiently.",
        ]),
      ],
    },
    {
      id: "sharing-your-information",
      number: "9",
      heading: "Sharing Your Information",
      level: 1,
      content: [
        p("Ordift Studios values the confidentiality of personal information."),
        p("We do not sell personal information to third parties."),
        p(
          "We only disclose information where necessary to provide our services, comply with legal obligations, protect legitimate interests, or where you have authorised us to do so."
        ),
        p("Information may be shared with the following categories of recipients."),
      ],
    },
    {
      id: "service-providers",
      number: "9.1",
      heading: "Service Providers",
      level: 2,
      content: [
        p("Trusted third-party providers may receive limited information where necessary to support our operations, including providers of:"),
        list([
          "website hosting;",
          "cloud storage;",
          "payment processing;",
          "accounting services;",
          "client relationship management;",
          "scheduling systems;",
          "communication platforms;",
          "email services;",
          "marketing platforms;",
          "analytics tools;",
          "IT support; and",
          "cybersecurity services.",
        ]),
        p("All such providers are expected to process information only for authorised purposes and maintain appropriate security measures."),
      ],
    },
    {
      id: "professional-advisers",
      number: "9.2",
      heading: "Professional Advisers",
      level: 2,
      content: [
        p("Information may be disclosed where necessary to our:"),
        list(["legal advisers;", "auditors;", "insurers;", "accountants;", "consultants; or", "other professional advisers,"]),
        p("provided such disclosure is required for legitimate business purposes and is subject to appropriate confidentiality obligations."),
      ],
    },
    {
      id: "legal-and-regulatory-authorities",
      number: "9.3",
      heading: "Legal and Regulatory Authorities",
      level: 2,
      content: [
        p("We may disclose information where required to:"),
        list(["comply with legal obligations;", "respond to lawful requests;", "enforce our agreements;", "protect our rights;", "investigate fraud or unlawful activity; or", "safeguard the safety of individuals or property."]),
      ],
    },
    {
      id: "business-transactions",
      number: "9.4",
      heading: "Business Transactions",
      level: 2,
      content: [
        p(
          "If Ordift Studios undergoes a merger, acquisition, restructuring, investment, sale of assets, or similar corporate transaction, personal information may be transferred as part of that transaction, subject to applicable legal safeguards."
        ),
      ],
    },
    {
      id: "with-your-consent",
      number: "9.5",
      heading: "With Your Consent",
      level: 2,
      content: [p("We may share information with other parties where you have expressly requested or authorized us to do so.")],
    },
    {
      id: "international-data-transfers",
      number: "10",
      heading: "International Data Transfers",
      level: 1,
      content: [
        p(
          "Ordift Studios operates internationally and may work with clients, suppliers, contractors, service providers, and technology platforms located in different countries."
        ),
        p("As a result, personal information may be transferred to or processed in jurisdictions outside your country of residence."),
        p("Where international transfers occur, we take reasonable steps to ensure that appropriate safeguards are implemented, including:"),
        list([
          "using reputable service providers with recognized security standards;",
          "entering into contractual safeguards where appropriate;",
          "limiting access to authorized personnel;",
          "implementing technical and organizational security measures; and",
          "complying with applicable legal requirements governing cross-border data transfers.",
        ]),
        p(
          "While we strive to protect personal information regardless of where it is processed, data protection laws may differ between jurisdictions. Ordift Studios will take reasonable measures to ensure that your information continues to receive an appropriate level of protection consistent with this Privacy Policy."
        ),
      ],
    },
    {
      id: "data-security",
      number: "11",
      heading: "Data Security",
      level: 1,
      content: [
        p(
          "Ordift Studios is committed to protecting the confidentiality, integrity, and availability of the personal information entrusted to us. We implement appropriate technical, administrative, and organizational measures designed to safeguard personal information against accidental or unlawful destruction, loss, alteration, unauthorized disclosure, or unauthorized access."
        ),
        p("Our security measures may include, where appropriate:"),
        list([
          "Secure password management and multi-factor authentication for business accounts.",
          "Role-based access controls to limit access to authorized personnel only.",
          "Encryption of data during transmission using secure communication protocols where available.",
          "Secure cloud storage provided by reputable service providers.",
          "Regular software updates and security patches.",
          "Firewall and endpoint protection on business devices.",
          "Secure backup procedures for business-critical information.",
          "Confidentiality obligations for employees, contractors, interns, and authorized collaborators.",
          "Internal procedures for responding to suspected security incidents or data breaches.",
        ]),
        p(
          "While we strive to maintain industry-appropriate safeguards, no method of transmitting information over the internet or storing electronic data can be guaranteed to be completely secure. Accordingly, Ordift Studios cannot guarantee absolute security but will continue to take reasonable steps to minimize risk and respond promptly to any identified vulnerabilities."
        ),
        p(
          "Where required by applicable law, we will notify affected individuals and relevant authorities of reportable personal data breaches within the prescribed legal timeframes."
        ),
      ],
    },
    {
      id: "data-retention",
      number: "12",
      heading: "Data Retention",
      level: 1,
      content: [
        p(
          "Ordift Studios retains personal information only for as long as it is reasonably necessary to fulfill the purposes described in this Privacy Policy, comply with contractual obligations, satisfy legal or regulatory requirements, resolve disputes, enforce our agreements, or protect our legitimate business interests."
        ),
        p("The retention period for different categories of information may vary depending on the nature of the services provided and applicable legal requirements."),
        p("Examples include:"),
        table(
          ["Information Category", "Typical Retention Purpose"],
          [
            ["Client enquiries", "Customer service and follow-up"],
            ["Booking records", "Contract administration and accounting"],
            ["Invoices and financial records", "Taxation and financial reporting"],
            ["Contracts and agreements", "Legal compliance and dispute resolution"],
            [
              "Creative project files",
              "Client delivery, revisions, archival, and portfolio management (subject to applicable agreements)",
            ],
            ["Website analytics", "Website performance analysis and service improvement"],
            ["Marketing preferences", "Until consent is withdrawn or communications are no longer relevant"],
          ]
        ),
        p(
          "Where information is no longer required, Ordift Studios will securely delete, anonymise, or otherwise dispose of it using reasonable methods appropriate to the nature of the information."
        ),
        p(
          "Certain records may be retained for longer periods where required by law, regulatory obligations, insurance requirements, litigation, or legitimate business purposes."
        ),
      ],
    },
    {
      id: "your-privacy-rights",
      number: "13",
      heading: "Your Privacy Rights",
      level: 1,
      content: [
        p("Subject to applicable law and any lawful limitations, you may have one or more of the following rights regarding your personal information."),
        p("These rights may include the right to:"),
        list([
          "request access to the personal information we hold about you;",
          "request correction of inaccurate or incomplete information;",
          "request deletion of personal information where legally permissible;",
          "request restriction of certain processing activities;",
          "object to processing based on legitimate interests;",
          "withdraw consent where processing is based on consent;",
          "request data portability where applicable;",
          "request information regarding how your personal information has been processed; and",
          "lodge a complaint with an appropriate supervisory authority where permitted by applicable law.",
        ]),
        p("Ordift Studios will consider and respond to privacy requests within a reasonable period and in accordance with applicable legal requirements."),
        p("To protect your privacy, we may request additional information to verify your identity before fulfilling certain requests."),
        p(
          "Some requests may be limited where continued processing is required to comply with legal obligations, fulfil contractual commitments, establish or defend legal claims, or protect the rights and legitimate interests of Ordift Studios or others."
        ),
      ],
    },
    {
      id: "marketing-communications",
      number: "14",
      heading: "Marketing Communications",
      level: 1,
      content: [
        p("Ordift Studios may periodically communicate with clients, subscribers, and interested individuals regarding:"),
        list([
          "new services;",
          "educational resources;",
          "workshops and training opportunities;",
          "promotional campaigns;",
          "special events;",
          "business announcements; and",
          "other information that may be relevant to our community.",
        ]),
        p("Where required by law, such communications will only be sent with your consent or another lawful basis for processing."),
        p("You may opt out of receiving marketing communications at any time by:"),
        list([
          "clicking the unsubscribe link included in our emails (where applicable);",
          "contacting us using the details provided in this Privacy Policy; or",
          "updating your communication preferences through any available client portal or account settings.",
        ]),
        p(
          "Please note that opting out of marketing communications does not prevent us from sending service-related communications necessary to fulfil contractual obligations, respond to enquiries, administer bookings, or comply with legal requirements."
        ),
      ],
    },
    {
      id: "photography-videography-creative-content",
      number: "15",
      heading: "Photography, Videography & Creative Content",
      level: 1,
      content: [
        p(
          "As a creative media company, Ordift Studios regularly creates, processes, stores, and delivers photographs, videos, audio recordings, digital artwork, and other creative works that may contain personal information or identifiable individuals."
        ),
        p("We recognise the unique privacy considerations associated with creative productions and are committed to handling such materials responsibly."),
      ],
    },
    {
      id: "creative-content-service-delivery",
      number: "15.1",
      heading: "Service Delivery",
      level: 2,
      content: [
        p("Creative content is collected and processed primarily for the purpose of delivering the services requested by our clients."),
        p("This may include planning, production, editing, post-production, delivery, archiving, quality assurance, and future client-requested revisions."),
      ],
    },
    {
      id: "portfolio-and-promotional-use",
      number: "15.2",
      heading: "Portfolio and Promotional Use",
      level: 2,
      content: [
        p(
          "Unless otherwise agreed in writing or restricted by contract, applicable law, or the nature of the assignment, Ordift Studios may request permission to use selected completed works for:"
        ),
        list([
          "portfolio presentations;",
          "website galleries;",
          "social media platforms;",
          "exhibitions;",
          "award submissions;",
          "educational demonstrations;",
          "promotional materials; and",
          "business development activities.",
        ]),
        p(
          "Where consent is required, we will seek it before using identifiable client content for these purposes. Clients may decline such requests without affecting the quality or availability of our services."
        ),
      ],
    },
    {
      id: "sensitive-assignments",
      number: "15.3",
      heading: "Sensitive Assignments",
      level: 2,
      content: [
        p("Ordift Studios recognizes that certain assignments involve heightened privacy expectations, including but not limited to:"),
        list([
          "private family events;",
          "children’s events;",
          "medical or healthcare settings;",
          "legal matters;",
          "confidential commercial projects;",
          "government assignments; and",
          "other sensitive engagements.",
        ]),
        p(
          "Additional confidentiality measures may be agreed upon for such projects through separate contractual terms or non-disclosure agreements where appropriate."
        ),
      ],
    },
    {
      id: "intellectual-property-creative",
      number: "15.4",
      heading: "Intellectual Property",
      level: 2,
      content: [
        p(
          "Ownership, licensing, usage rights, and copyright relating to creative works are governed by the applicable service agreement, licensing terms, or other contractual documents entered into with the client. Nothing in this Privacy Policy alters those contractual rights or obligations."
        ),
      ],
    },
    {
      id: "artificial-intelligence-digital-workflow",
      number: "16",
      heading: "Artificial Intelligence & Digital Workflow",
      level: 1,
      content: [
        p(
          "Ordift Studios may utilize artificial intelligence (“AI”) and other advanced digital technologies to enhance the efficiency, quality, and consistency of certain business and creative processes."
        ),
        p("Examples may include:"),
        list([
          "image enhancement;",
          "color correction;",
          "noise reduction;",
          "object selection;",
          "transcription;",
          "caption generation;",
          "workflow automation;",
          "scheduling assistance;",
          "document drafting;",
          "quality control;",
          "metadata management; and",
          "other productivity tools.",
        ]),
        p("AI technologies are used as assistive tools under human oversight and are not intended to replace professional creative judgement."),
        p(
          "Where third-party AI or cloud-based services are used, Ordift Studios will make reasonable efforts to use reputable providers that maintain appropriate privacy and security standards."
        ),
        p("We do not intentionally use client materials to train publicly available AI models unless:"),
        list([
          "the client has expressly authorized such use in writing; or",
          "the processing is otherwise permitted by applicable law and consistent with our contractual obligations.",
        ]),
        p("Where appropriate, clients may request additional information regarding the use of AI-assisted workflows in connection with their projects."),
      ],
    },
    {
      id: "childrens-privacy",
      number: "17",
      heading: "Children’s Privacy",
      level: 1,
      content: [
        p("Ordift Studios recognizes the importance of protecting the privacy of children and young people."),
        p(
          "Our website and general services are not directed specifically at children, and we do not knowingly collect personal information directly from children except where such collection is necessary for the provision of a requested service and is authorised by a parent, legal guardian, school, organisation, or other person with lawful authority."
        ),
        p(
          "Where our services involve children—including family portraits, school photography, youth programme, competitions, workshops, performances, sporting events, or similar assignments—we expect the client or organizing party to ensure that all necessary permissions and consents have been obtained before the collection or creation of personal information or creative content."
        ),
        p(
          "Where required by applicable law or by the nature of the assignment, Ordift Studios may request written consent from a parent or legal guardian before processing or using identifiable images or information relating to a child."
        ),
        p(
          "If we become aware that personal information relating to a child has been collected in a manner inconsistent with applicable legal requirements, we will take reasonable steps to investigate the matter and, where appropriate, delete the information or restrict its processing."
        ),
        p(
          "Parents and legal guardians who have questions regarding the processing of a child’s personal information may contact us using the details provided in this Privacy Policy."
        ),
      ],
    },
    {
      id: "changes-to-this-privacy-policy",
      number: "18",
      heading: "Changes to this Privacy Policy",
      level: 1,
      content: [
        p("Ordift Studios may update this Privacy Policy from time to time to reflect:"),
        list([
          "changes in applicable laws or regulations;",
          "developments in technology;",
          "improvements to our business operations;",
          "the introduction of new products or services;",
          "enhancements to our digital platforms;",
          "changes in industry standards; or",
          "other legitimate business or legal requirements.",
        ]),
        p(
          "When material changes are made, we will take reasonable steps to notify users where appropriate. Notification methods may include updates published on our website, client portals, email communications, or other suitable channels."
        ),
        p("The “Last Updated” date shown in the Document Control section will indicate the most recent revision."),
        p("We encourage users to review this Privacy Policy periodically to remain informed about how Ordift Studios protects personal information."),
        p(
          "Continued use of our website or services after an updated version becomes effective constitutes acceptance of the revised Privacy Policy to the extent permitted by applicable law."
        ),
      ],
    },
    {
      id: "governing-law",
      number: "19",
      heading: "Governing Law",
      level: 1,
      content: [
        p(
          "This Privacy Policy shall be governed by and interpreted in accordance with the laws applicable to the jurisdiction identified in the relevant client agreement, service contract, or applicable terms governing the relationship between Ordift Studios and the client."
        ),
        p(
          "Where services are provided across multiple jurisdictions, Ordift Studios will endeavor to comply with applicable privacy and data protection laws relevant to the particular engagement, taking into account the location of the client, the nature of the services provided, and any contractual obligations agreed between the parties."
        ),
        p("Nothing in this Privacy Policy limits any rights or protections that may be available to individuals under mandatory provisions of applicable law."),
      ],
    },
    {
      id: "contact-information",
      number: "20",
      heading: "Contact Information",
      level: 1,
      content: [
        p("Questions, requests, or concerns relating to this Privacy Policy or the processing of personal information may be directed to:"),
        p("Ordift Studios"),
        p("Privacy & Data Protection Contact"),
        p("Email: matetey@ordiftghana.com"),
        p("Website: www.ordiftstudios.com"),
        p("Telephone:"),
        list(["+974 5510 4490", "+233 504 981 277"]),
        p(
          "Business enquiries submitted through our official website or authorized communication channels will be directed to the appropriate member of our team for review and response."
        ),
        p(
          "Where applicable, requests relating to access, correction, deletion, restriction, objection, or other privacy rights should include sufficient information to enable us to verify the identity of the requester and process the request appropriately."
        ),
      ],
    },
    {
      id: "related-documents",
      number: "21",
      heading: "Related Documents",
      level: 1,
      content: [
        p("This Privacy Policy should be read together with other applicable Ordift Studios policies, agreements, and legal notices, including but not limited to:"),
        list([
          "OS-LGL-002 – Cookie Policy",
          "OS-LGL-003 – Website Terms of Use",
          "OS-LGL-004 – Master Booking Terms & Conditions",
          "Future Intellectual Property Policy",
          "Future AI & Digital Workflow Policy",
          "Client Service Agreements",
          "Event Booking Agreements",
          "Workshop & Training Terms",
          "Non-Disclosure Agreements (where applicable)",
        ]),
        p(
          "In the event of any inconsistency between this Privacy Policy and a specific written agreement governing a particular service or engagement, the terms of that written agreement shall prevail to the extent of the inconsistency."
        ),
      ],
    },
    {
      id: "controlled-document-notice",
      number: "22",
      heading: "Controlled Document Notice",
      level: 1,
      content: [
        p("This document forms part of the Ordift Studios Enterprise Legal Series and is issued as a controlled corporate publication."),
        p("The current approved version is identified by the Document Code, Version Number, and Effective Date shown in the Document Control section."),
        p("Printed, downloaded, or locally stored copies are considered uncontrolled copies unless expressly identified otherwise by Ordift Studios."),
        p("Ordift Studios reserves the right to amend, replace, or withdraw this document at any time in accordance with its document governance procedures."),
        p("The latest approved version will always be made available through the official Ordift Studios website or other authorized publication channels."),
      ],
    },
    // Appendices A–G are shared, series-wide standing provisions — see
    // ../boilerplate.ts and registry.ts's withStandardAppendices(). Not
    // duplicated here so every document in the series gets the same
    // set automatically.
  ],
};
