// Real, already-approved site-wide copy — NOT placeholder/sample content
// (unlike data.ts, portfolioData.ts, journalData.ts). Mirrors exactly
// what was live in the hardcoded page components before the Version
// 1.2.6 migration, so this file is both the local-dev fallback source
// and the source of truth the Sanity seed script ports from. See
// MILESTONES.md V1.2.6 and CMS_MIGRATION.md.

import type {
  AboutPage,
  Founder,
  FooterSettings,
  HomePage,
  LegalPage,
  Navigation,
  Service,
  SiteSettings,
} from "../types";

export const SITE_SETTINGS: SiteSettings = {
  siteName: "Ordift Studios",
  tagline: "A multidisciplinary creative house.",
  logoUrl: null,
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "ordift.ghana@gmail.com",
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "447777371023",
  socialLinks: [],
  defaultSeo: {
    metaTitle: "Ordift Studios — A Multidisciplinary Creative House",
    metaDescription:
      "Ordift Studios is a multidisciplinary creative house where photography, film, design, branding, content and talent work as one connected system.",
    ogImageUrl: null,
    canonicalUrl: null,
  },
};

export const HOME_PAGE: HomePage = {
  heroEyebrow: "Photography · Film · Design · Talent · Strategy",
  heroHeadline: "Creating stories people do not just see, but remember.",
  heroSubheadline:
    "Ordift Studios is a multidisciplinary creative house where photography, film, design, branding, content and talent work as one connected system.",
  heroPrimaryCta: { label: "Explore Our Work", href: "/work" },
  heroSecondaryCta: { label: "Book a Service", href: "/book" },
  heroImage: { type: "image", url: null, alt: "", width: null, height: null, lqip: null },
  whoWeAreEyebrow: "Who We Are",
  whoWeAreBody:
    "Ordift Studios is a multidisciplinary creative house where photography, film, design, branding, content and talent work as one connected system. We create more than visual assets — we shape stories, identities and experiences that help brands, businesses and people become memorable.",
  originalsEyebrow: "Ordift Originals",
  originalsHeadline: "Original ideas, made under the Ordift name.",
  originalsBody:
    "Beyond client work, Ordift Studios develops its own original media and creative projects — announced as they're ready.",
  process: [
    { step: "Discover", copy: "Understand the brief, the brand, and what the work needs to do." },
    { step: "Plan", copy: "Scope, deliverables and cost agreed before production starts." },
    { step: "Create", copy: "The shoot, the design, the build." },
    { step: "Refine", copy: "Review and revisions, on terms set from the start." },
    { step: "Deliver", copy: "Final assets, ready to use." },
  ],
  ctaHeadline: "Have an idea worth creating?",
  ctaBody: "We shape stories people remember.",
  ctaPrimary: { label: "Start a Project", href: "/book" },
  ctaSecondary: { label: "Collaborate With Us", href: "/book?service=partnership" },
  seo: {
    metaTitle: "Ordift Studios — A Multidisciplinary Creative House",
    metaDescription:
      "Ordift Studios is a multidisciplinary creative house where photography, film, design, branding, content and talent work as one connected system.",
    ogImageUrl: null,
    canonicalUrl: null,
  },
};

export const ABOUT_PAGE: AboutPage = {
  heroEyebrow: "About",
  heroHeadline: "A multidisciplinary creative house, built deliberately.",
  storyEyebrow: "Our Story",
  storyHeadline: "Every memorable story begins with someone noticing what others overlook.",
  storyBody: [
    "Ordift Studios began with founder Myredlive Anim-Tetey's natural interest in preserving meaningful moments — from school celebrations and family gatherings to architecture, landscapes and abstract art.",
    "While studying at the University of Ghana, he supported the promotion and organisation of residential-hall events while scouting individuals for television and radio commercials. In 2016, serving as the sole accredited photographer for a Hall Week celebration led to requests from other halls for event coverage and promotional design — turning a personal creative interest into a growing practice.",
    "The name Ordift comes from “God's Gift,” reflecting a belief that creativity is a gift to be developed and used with excellence, integrity and purpose.",
    "A pharmaceutical product-launch campaign later became a major turning point — seeing the work on billboards and in commercial advertising revealed that the vision could extend far beyond individual photographs.",
    "Today, Ordift Studios is growing into a multidisciplinary creative house where photography, film, design, branding, content and talent work as one connected system — shaping stories people remember.",
  ],
  mission:
    "To shape memorable brands, stories and experiences through connected photography, film, design, strategy, content and talent — delivered with creativity, integrity and intentional execution.",
  vision:
    "To build an African-founded global creative house recognised for memorable visual storytelling, connected creative services, exceptional talent and work that carries lasting cultural and commercial value.",
  values: [
    { name: "Craft", copy: "Every project is treated as work worth signing." },
    { name: "Originality", copy: "Concepts are built from the client's story, not a template." },
    { name: "Integrity", copy: "What's promised in a proposal is what gets delivered." },
    { name: "Collaboration", copy: "The best creative work is made with people, not for them." },
    { name: "Excellence", copy: "The standard is the best version of the work, not the fastest one that's acceptable." },
  ],
  teamEyebrow: "Our Team",
  teamHeadline: "A team of creative minds, not a solo act.",
  teamBody: [
    "Ordift Studios is shaped by the creative minds behind each department — working across photography, film, design, branding, content and talent as one connected studio, not as separate freelancers passing a project between them.",
    "The studio is led by Founder & Creative Director Myredlive Anim-Tetey, working with selected creative professionals and production partners as each project requires.",
  ],
  ctaHeadline: "Have an idea worth creating?",
  ctaBody: "We shape stories people remember.",
  seo: {
    metaTitle: "About — Ordift Studios",
    metaDescription:
      "Ordift Studios is a multidisciplinary creative house — our story, mission, vision, values and team.",
    ogImageUrl: null,
    canonicalUrl: null,
  },
};

export const FOUNDER: Founder = {
  name: "Myredlive Anim-Tetey",
  title: "Founder & Creative Director",
  photoUrl: null,
  bio: [
    "Myredlive Anim-Tetey is the Founder and Creative Director of Ordift Studios, a multidisciplinary creative house built around connected photography, film, design, branding, content and talent.",
    "Having studied Business at Senior High School, with experience across creative production, marketing, event coordination and talent scouting, he brings both artistic instinct and organisational thinking to the company's direction.",
    "His creative philosophy is rooted in the belief that talent is a gift from God, but meaningful impact requires discipline, resilience and consistent development. Inspired by Ghanaian creatives including the late Bob Pixel, he aims to build work that is remembered while recognising potential, creating opportunities and positively influencing the people involved.",
    "As founder, he remains closely involved in creative direction and quality, while building the systems, standards and culture required for Ordift Studios to grow beyond one person.",
  ],
};

export const NAVIGATION: Navigation = {
  links: [
    { label: "About", href: "/about" },
    { label: "Services", href: "/services" },
    { label: "Work", href: "/work" },
    { label: "Workshops", href: "/workshops" },
    { label: "Talent", href: "/services/talent-management" },
    { label: "Stories", href: "/journal" },
  ],
  primaryCta: { label: "Book a Service", href: "/book" },
};

export const FOOTER_SETTINGS: FooterSettings = {
  tagline:
    "A multidisciplinary creative house — photography, film, design, branding, content and talent working as one system.",
  columns: [
    {
      heading: "Services",
      links: [
        { label: "Photography", href: "/services/photography" },
        { label: "Videography", href: "/services/videography" },
        { label: "Graphic Design", href: "/services/graphic-design" },
        { label: "Branding & Strategy", href: "/services/branding" },
        { label: "Content Creation", href: "/services/content-creation" },
        { label: "Production Services", href: "/services/production" },
      ],
    },
    {
      heading: "Studio",
      links: [
        { label: "About", href: "/about" },
        { label: "Work", href: "/work" },
        { label: "Workshops", href: "/workshops" },
        { label: "Stories", href: "/journal" },
        { label: "Contact", href: "/book?service=general" },
      ],
    },
    {
      heading: "Talent",
      links: [
        // A single accurate link, not three — "Talent Directory"/"Book
        // Talent"/"Apply as Talent" each implied a distinct feature that
        // doesn't exist yet (Talent Management is Phase 1B, unbuilt);
        // all three pointed at this same service page anyway.
        { label: "Talent Management", href: "/services/talent-management" },
      ],
    },
  ],
};

export const SERVICES: Service[] = [
  {
    id: "service-photography",
    slug: "photography",
    name: "Photography",
    summaryDescription: "Commercial, portrait, editorial and event photography.",
    heroEyebrow: "Department",
    heroHeadline: "Photography",
    heroBody:
      "A photograph is a claim about how something should be remembered. The job isn't “take good pictures,” it's deciding what's worth remembering before the shutter ever clicks.",
    offeringsHeadline: "From a single headshot to a full campaign shoot",
    offerings: [
      "Commercial Photography", "Product Photography", "Food Photography", "Fashion Photography",
      "Beauty Photography", "Editorial Photography", "Portrait Photography", "Personal Branding Photography",
      "Corporate Photography", "Headshots", "Wedding Photography", "Event Photography", "Lifestyle Photography",
      "Architecture and Interior Photography", "Travel Photography", "Creative Concept Photography",
      "Church and Ministry Photography",
    ],
    additionalHeading: null,
    additionalItems: [],
    ctaEyebrow: null,
    ctaHeadline: "Ready to book a shoot?",
    ctaBody: "Tell us what you're building. We'll tell you what it needs.",
    ctaPrimaryLabel: "Book a Photoshoot",
    ctaSecondaryLabel: "Request a Commercial Quote",
    isComingSoon: false,
    displayOrder: 1,
    seo: {
      metaTitle: "Photography — Ordift Studios",
      metaDescription: "Commercial, portrait, editorial, event and brand photography from Ordift Studios.",
      ogImageUrl: null,
      canonicalUrl: null,
    },
  },
  {
    id: "service-videography",
    slug: "videography",
    name: "Videography",
    summaryDescription: "Brand films, event coverage and short-form content.",
    heroEyebrow: "Department",
    heroHeadline: "Videography",
    heroBody:
      "Film is photography with time added, and time is what most brand video wastes. Every second earns its place or gets cut.",
    offeringsHeadline: "From a single interview to a full production",
    offerings: [
      "Commercial Films", "Brand Films", "Corporate Videos", "Social Media Advertisements", "Short-form Content",
      "Event Films", "Wedding Films", "Interviews", "Documentaries", "Music Videos", "Real Estate Videos",
      "Fashion Films", "Product Videos", "Food Videos", "Behind-the-Scenes Videos", "Church and Ministry Productions",
      "YouTube Productions", "Podcast Video Production", "Drone Videography, when available",
    ],
    additionalHeading: null,
    additionalItems: [],
    ctaEyebrow: null,
    ctaHeadline: "Ready to start a video project?",
    ctaBody: "Tell us what you're building. We'll tell you what it needs.",
    ctaPrimaryLabel: "Start a Video Project",
    ctaSecondaryLabel: "Request a Production Quote",
    isComingSoon: false,
    displayOrder: 2,
    seo: {
      metaTitle: "Videography — Ordift Studios",
      metaDescription: "Brand films, corporate video, event coverage and short-form content from Ordift Studios.",
      ogImageUrl: null,
      canonicalUrl: null,
    },
  },
  {
    id: "service-graphic-design",
    slug: "graphic-design",
    name: "Graphic Design",
    summaryDescription: "Identity systems, print and digital design.",
    heroEyebrow: "Department",
    heroHeadline: "Graphic Design",
    heroBody:
      "Design that isn't used consistently isn't design, it's a one-time favor. The job is building systems a client can run with.",
    offeringsHeadline: "From a single logo to a full identity system",
    offerings: [
      "Logo Design", "Brand Identity", "Social Media Designs", "Flyers", "Posters", "Brochures", "Company Profiles",
      "Pitch Decks", "Presentation Design", "Packaging Design", "Product Labels", "Menu Design", "Business Cards",
      "Event Branding", "Billboards", "Print Design", "Digital Advertising Materials", "Motion Graphics",
      "Basic Web Graphics",
    ],
    additionalHeading: null,
    additionalItems: [],
    ctaEyebrow: null,
    ctaHeadline: "Ready to start a design project?",
    ctaBody: "Tell us what you're building. We'll tell you what it needs.",
    ctaPrimaryLabel: "Start a Design Project",
    ctaSecondaryLabel: "Request a Brand Package",
    isComingSoon: false,
    displayOrder: 3,
    seo: {
      metaTitle: "Graphic Design — Ordift Studios",
      metaDescription: "Logo design, brand identity, print and digital design systems from Ordift Studios.",
      ogImageUrl: null,
      canonicalUrl: null,
    },
  },
  {
    id: "service-branding",
    slug: "branding",
    name: "Branding & Creative Strategy",
    summaryDescription: "Positioning, creative direction, campaign development.",
    heroEyebrow: "Department",
    heroHeadline: "Branding & Creative Strategy",
    heroBody:
      "Most “branding” work is decoration applied after the real decisions were made elsewhere. This department exists so the decisions and the decoration come from the same place.",
    offeringsHeadline: "Taking a brand from concept to execution",
    offerings: [
      "Brand Strategy", "Brand Positioning", "Creative Direction", "Campaign Development", "Visual Identity",
      "Content Strategy", "Social Media Strategy", "Brand Storytelling", "Brand Naming", "Creative Consultation",
      "Campaign Planning", "Moodboard Development", "Launch Strategy", "Brand Refresh", "Creative Project Management",
    ],
    additionalHeading: null,
    additionalItems: [],
    ctaEyebrow: null,
    ctaHeadline: "Ready to build the strategy behind the work?",
    ctaBody: "Tell us what you're building. We'll tell you what it needs.",
    ctaPrimaryLabel: "Start a Branding Project",
    ctaSecondaryLabel: "Book a Consultation",
    isComingSoon: false,
    displayOrder: 4,
    seo: {
      metaTitle: "Branding & Creative Strategy — Ordift Studios",
      metaDescription: "Brand strategy, positioning, creative direction and campaign development from Ordift Studios.",
      ogImageUrl: null,
      canonicalUrl: null,
    },
  },
  {
    id: "service-content-creation",
    slug: "content-creation",
    name: "Content Creation",
    summaryDescription: "Ongoing, platform-ready photography and short-form video.",
    heroEyebrow: "Department",
    heroHeadline: "Content Creation",
    heroBody: "Content produced in a single monthly scramble looks like a scramble. The discipline here is a real pipeline.",
    offeringsHeadline: "A steady stream, not a one-off shoot",
    offerings: [
      "Monthly Content Production", "Photography Content Packages", "Short-Form Video Packages",
      "Social Media Campaign Production", "Reels and TikTok Content", "Product Content", "Food Content",
      "Personal Brand Content", "Corporate Content", "Behind-the-Scenes Content", "Script Development",
      "Content Planning", "Content Calendars", "Editing and Post-Production", "Platform-Ready Content Resizing",
    ],
    additionalHeading: "Who It's For",
    additionalItems: [
      "Businesses", "Restaurants", "Fashion brands", "Personal brands", "Influencers", "Churches",
      "Event companies", "Hotels", "Real estate companies", "Start-ups",
    ],
    ctaEyebrow: null,
    ctaHeadline: "Ready for a real content pipeline?",
    ctaBody: "Tell us what you're building. We'll tell you what it needs.",
    ctaPrimaryLabel: "Start a Content Plan",
    ctaSecondaryLabel: "Request a Quote",
    isComingSoon: false,
    displayOrder: 5,
    seo: {
      metaTitle: "Content Creation — Ordift Studios",
      metaDescription: "Ongoing, platform-ready photography and short-form video production from Ordift Studios.",
      ogImageUrl: null,
      canonicalUrl: null,
    },
  },
  {
    id: "service-talent-management",
    slug: "talent-management",
    name: "Talent Management",
    summaryDescription: "Representation and booking for models, creators and hosts.",
    heroEyebrow: "Department",
    heroHeadline: "Talent Management",
    heroBody:
      "Matchmaking with real stakes on both sides — a brand's campaign and a person's livelihood. Both get treated with equal seriousness.",
    offeringsHeadline: "Who we represent",
    offerings: [
      "Models", "Actors", "Presenters", "Influencers", "Content Creators", "Brand Ambassadors", "Hosts",
      "Event Staff", "Promotional Talent",
    ],
    additionalHeading: null,
    additionalItems: [],
    ctaEyebrow: "Coming Soon",
    ctaHeadline: "The talent directory and booking system are on the way.",
    ctaBody: "Talent applications and brand bookings open once the secure systems behind them are ready. In the meantime, get in touch directly.",
    ctaPrimaryLabel: "Get in Touch",
    ctaSecondaryLabel: null,
    isComingSoon: true,
    displayOrder: 6,
    seo: {
      metaTitle: "Talent Management — Ordift Studios",
      metaDescription: "Representation and booking for models, creators, presenters and brand ambassadors — coming soon from Ordift Studios.",
      ogImageUrl: null,
      canonicalUrl: null,
    },
  },
  {
    id: "service-production",
    slug: "production",
    name: "Production Services",
    summaryDescription: "Pre-production through post — a full production partner.",
    heroEyebrow: "Department",
    heroHeadline: "Production Services",
    heroBody:
      "The unglamorous half of any shoot — scouting, scheduling, casting logistics — is what actually determines whether the glamorous half goes well. This department is where that discipline lives.",
    offeringsHeadline: "A production partner, not just a crew",
    offerings: [
      "Pre-Production", "Creative Development", "Concept Development", "Scriptwriting", "Storyboarding",
      "Moodboards", "Casting", "Location Scouting", "Production Coordination", "Photography Production",
      "Video Production", "Post-Production", "Editing", "Colour Grading", "Retouching", "Sound Design",
      "Graphic Design", "Motion Graphics", "Content Delivery", "Campaign Asset Production",
    ],
    additionalHeading: null,
    additionalItems: [],
    ctaEyebrow: null,
    ctaHeadline: "Need a production partner?",
    ctaBody: "Tell us what you're building. We'll tell you what it needs.",
    ctaPrimaryLabel: "Start a Production",
    ctaSecondaryLabel: "Request a Quote",
    isComingSoon: false,
    displayOrder: 7,
    seo: {
      metaTitle: "Production Services — Ordift Studios",
      metaDescription: "Pre-production through post — a full production partner from Ordift Studios.",
      ogImageUrl: null,
      canonicalUrl: null,
    },
  },
];

export const LEGAL_PAGES: LegalPage[] = [
  {
    slug: "privacy",
    title: "Privacy Notice",
    body:
      "This page is a placeholder. The approved Privacy Notice will explain what personal data Ordift Studios collects through this website (including enquiry forms), why, how it's stored, who it's shared with, and how to request access or deletion. Nothing on this page should be relied on until it is reviewed and approved.",
    isApproved: false,
    lastUpdated: null,
  },
  {
    slug: "terms",
    title: "Website Terms",
    body:
      "This page is a placeholder for the approved terms governing use of this website. Nothing on this page should be relied on until it is reviewed and approved.",
    isApproved: false,
    lastUpdated: null,
  },
  {
    slug: "cookies",
    title: "Cookie Notice",
    body:
      "This page is a placeholder for the approved notice covering cookies and similar tracking technologies used on this website (including analytics, once connected). Nothing on this page should be relied on until it is reviewed and approved.",
    isApproved: false,
    lastUpdated: null,
  },
  {
    slug: "booking",
    title: "Booking Terms",
    body:
      "This page is a placeholder for the approved terms covering enquiries, deposits, scheduling, revisions, cancellations and rescheduling. Nothing on this page should be relied on until it is reviewed and approved.",
    isApproved: false,
    lastUpdated: null,
  },
];
