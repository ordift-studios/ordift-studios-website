import type {
  Category,
  Instructor,
  Sponsor,
  Testimonial,
  Venue,
  Workshop,
} from "../types";

// TEMPORARY sample content source for the Workshop Platform's architecture
// review. Every record below is clearly labeled [SAMPLE] and exists only
// to demonstrate the full content model (categories, instructors, venues,
// galleries, FAQs, certificates, testimonials, sponsors, related
// workshops, recurring/online/multi-day flags) end-to-end in staging.
//
// Per the zero-invention and empty-state rules, none of this is real
// Ordift Studios content and none of it should reach production as-is —
// it must be replaced with real, approved content (or removed) before
// launch, whether that swap happens by editing this file directly or by
// connecting a real CMS behind LocalContentRepository (see
// CMS_MIGRATION.md).

export const CATEGORIES: Category[] = [
  {
    id: "cat-photography-fundamentals",
    slug: "photography-fundamentals",
    name: "Photography Fundamentals",
    description: "Core technical and creative skills behind the camera.",
  },
  {
    id: "cat-videography-filmmaking",
    slug: "videography-filmmaking",
    name: "Videography & Filmmaking",
    description: "Motion, story and production craft.",
  },
  {
    id: "cat-business-of-creativity",
    slug: "business-of-creativity",
    name: "Business of Creativity",
    description: "Running a sustainable creative practice.",
  },
  {
    id: "cat-post-production",
    slug: "post-production",
    name: "Post-Production & Editing",
    description: "Retouching, grading and finishing work.",
  },
];

export const INSTRUCTORS: Instructor[] = [
  {
    id: "instructor-sample-1",
    slug: "sample-lead-instructor",
    name: "[SAMPLE] Instructor Name",
    title: "[SAMPLE] Lead Photography Instructor",
    bio: "Placeholder biography for architecture review only. A real instructor's approved bio, credentials and photo will replace this before launch.",
    photoUrl: null,
    credentials: ["[SAMPLE] Credential one", "[SAMPLE] Credential two"],
    isPlaceholder: true,
  },
  {
    id: "instructor-sample-2",
    slug: "sample-guest-instructor",
    name: "[SAMPLE] Guest Instructor Name",
    title: "[SAMPLE] Guest Videography Instructor",
    bio: "Placeholder biography for architecture review only, demonstrating a workshop with more than one instructor.",
    photoUrl: null,
    credentials: ["[SAMPLE] Credential one"],
    isPlaceholder: true,
  },
];

export const VENUES: Venue[] = [
  {
    id: "venue-sample-studio",
    name: "[SAMPLE] Ordift Studio Space",
    addressLine: "Accra, Ghana (placeholder — real address pending approval)",
    format: "in-person",
    mapUrl: null,
  },
  {
    id: "venue-sample-online",
    name: "[SAMPLE] Online via Video Call",
    addressLine: null,
    format: "online",
    mapUrl: null,
  },
];

export const TESTIMONIALS: Testimonial[] = [
  {
    id: "testimonial-sample-1",
    quote:
      "[PLACEHOLDER TESTIMONIAL] This is sample text standing in for a real attendee quote, used only to preview the layout before any real testimonial is collected and approved.",
    authorName: "[Placeholder Name]",
    authorRole: "[Placeholder — e.g. Workshop Attendee]",
    isPlaceholder: true,
  },
  {
    id: "testimonial-sample-2",
    quote:
      "[PLACEHOLDER TESTIMONIAL] A second sample quote, purely for layout review — not a real attendee's words.",
    authorName: "[Placeholder Name]",
    authorRole: "[Placeholder — e.g. Workshop Attendee]",
    isPlaceholder: true,
  },
];

export const SPONSORS: Sponsor[] = [
  {
    id: "sponsor-sample-1",
    name: "[SAMPLE] Sponsor Name",
    logoUrl: null,
    url: null,
    isPlaceholder: true,
  },
];

const inTenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
const inThirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const inThirtyOneDays = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

export const WORKSHOPS: Workshop[] = [
  {
    id: "sample-workshop-1",
    slug: "sample-portrait-lighting-workshop",
    title: "[SAMPLE] Portrait Lighting Fundamentals",
    shortDescription:
      "A demo workshop entry used to verify the registration system end-to-end. Not a real, scheduled workshop.",
    description:
      "This is placeholder content for architecture review only. Real workshop copy, dates and pricing will replace this once approved.",
    status: "open",
    categoryIds: ["cat-photography-fundamentals"],
    instructorIds: ["instructor-sample-1"],
    venueId: "venue-sample-studio",
    capacity: 3, // kept small so the waitlist path is easy to demonstrate
    startDate: inTenDays,
    endDate: inTenDays,
    registrationDeadline: inSevenDays,
    experienceLevels: ["beginner", "intermediate"],
    requiresPayment: true,
    learningOutcomes: [
      "[SAMPLE] Understand three-point lighting setups",
      "[SAMPLE] Practice directing a subject during a live shoot",
      "[SAMPLE] Learn how to modify light with common tools",
    ],
    agenda: [
      {
        id: "agenda-1",
        time: "9:00 AM – 10:30 AM",
        title: "[SAMPLE] Lighting theory",
        description: "Placeholder agenda item.",
      },
      {
        id: "agenda-2",
        time: "10:45 AM – 1:00 PM",
        title: "[SAMPLE] Live studio practice",
        description: "Placeholder agenda item.",
      },
    ],
    gallery: [],
    faqs: [
      {
        id: "faq-1",
        question: "[SAMPLE] Do I need to bring my own camera?",
        answer: "Placeholder answer for architecture review only.",
      },
      {
        id: "faq-2",
        question: "[SAMPLE] Is this workshop suitable for beginners?",
        answer: "Placeholder answer for architecture review only.",
      },
    ],
    certificate: {
      offered: true,
      description: "[SAMPLE] Certificate of completion description, pending real copy.",
    },
    testimonialIds: [],
    sponsorIds: [],
    relatedWorkshopIds: ["sample-workshop-3", "sample-workshop-4"],
    isRecurring: false,
    recurrenceNote: null,
    isOnlineAttendancePossible: false,
    hasRecordedSession: false,
    isMembersOnly: false,
  },
  {
    id: "sample-workshop-2",
    slug: "sample-social-content-two-day-intensive",
    title: "[SAMPLE] Social Media Content — Two-Day Intensive",
    shortDescription:
      "Placeholder multi-day, hybrid workshop entry demonstrating online attendance and a free (no-payment) format.",
    description:
      "This is placeholder content for architecture review only. Demonstrates a two-day, hybrid (in-person + online) workshop with no payment required.",
    status: "open",
    categoryIds: ["cat-videography-filmmaking", "cat-business-of-creativity"],
    instructorIds: ["instructor-sample-1", "instructor-sample-2"],
    venueId: "venue-sample-online",
    capacity: 25,
    startDate: inThirtyDays,
    endDate: inThirtyOneDays,
    registrationDeadline: inThirtyDays,
    experienceLevels: ["all-levels"],
    requiresPayment: false,
    learningOutcomes: [
      "[SAMPLE] Plan a week of short-form content in one sitting",
      "[SAMPLE] Shoot and edit on a phone with confidence",
    ],
    agenda: [
      {
        id: "agenda-1",
        time: "Day 1, 2:00 PM – 5:00 PM",
        title: "[SAMPLE] Content strategy",
        description: null,
      },
      {
        id: "agenda-2",
        time: "Day 2, 2:00 PM – 5:00 PM",
        title: "[SAMPLE] Shoot & edit lab",
        description: null,
      },
    ],
    gallery: [],
    faqs: [
      {
        id: "faq-1",
        question: "[SAMPLE] Can I attend just one of the two days?",
        answer: "Placeholder answer for architecture review only.",
      },
    ],
    certificate: { offered: false, description: null },
    testimonialIds: [],
    sponsorIds: ["sponsor-sample-1"],
    relatedWorkshopIds: ["sample-workshop-1"],
    isRecurring: true,
    recurrenceNote: "[SAMPLE] Planned to run quarterly, pending confirmation.",
    isOnlineAttendancePossible: true,
    hasRecordedSession: true,
    isMembersOnly: false,
  },
  {
    id: "sample-workshop-3",
    slug: "sample-brand-storytelling-masterclass",
    title: "[SAMPLE] Brand Storytelling Masterclass",
    shortDescription:
      "Placeholder completed workshop, used to populate the Past Workshops section and sample testimonials.",
    description:
      "This is placeholder content for architecture review only, representing a workshop that has already taken place.",
    status: "completed",
    categoryIds: ["cat-business-of-creativity"],
    instructorIds: ["instructor-sample-1"],
    venueId: "venue-sample-studio",
    capacity: 15,
    startDate: sixtyDaysAgo,
    endDate: sixtyDaysAgo,
    registrationDeadline: sixtyDaysAgo,
    experienceLevels: ["intermediate", "advanced"],
    requiresPayment: true,
    learningOutcomes: ["[SAMPLE] Build a brand narrative framework"],
    agenda: [],
    gallery: [],
    faqs: [],
    certificate: { offered: true, description: "[SAMPLE] Certificate description." },
    testimonialIds: ["testimonial-sample-1", "testimonial-sample-2"],
    sponsorIds: [],
    relatedWorkshopIds: ["sample-workshop-1"],
    isRecurring: false,
    recurrenceNote: null,
    isOnlineAttendancePossible: false,
    hasRecordedSession: false,
    isMembersOnly: false,
  },
  {
    id: "sample-workshop-4",
    slug: "sample-drone-cinematography-intro",
    title: "[SAMPLE] Introduction to Drone Cinematography",
    shortDescription:
      "Placeholder coming-soon workshop, used to demonstrate the Coming Soon status and a members-only flag.",
    description:
      "This is placeholder content for architecture review only, representing an announced but not-yet-open workshop.",
    status: "coming-soon",
    categoryIds: ["cat-videography-filmmaking"],
    instructorIds: ["instructor-sample-2"],
    venueId: "venue-sample-studio",
    capacity: 10,
    startDate: null,
    endDate: null,
    registrationDeadline: null,
    experienceLevels: ["intermediate"],
    requiresPayment: true,
    learningOutcomes: ["[SAMPLE] Fly safely and legally", "[SAMPLE] Basic aerial shot composition"],
    agenda: [],
    gallery: [],
    faqs: [],
    certificate: { offered: false, description: null },
    testimonialIds: [],
    sponsorIds: [],
    relatedWorkshopIds: ["sample-workshop-1"],
    isRecurring: false,
    recurrenceNote: null,
    isOnlineAttendancePossible: false,
    hasRecordedSession: false,
    isMembersOnly: true,
  },
];
