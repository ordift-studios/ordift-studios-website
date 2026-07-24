import { defineField, defineType } from "sanity";

// Mirrors Workshop in types.ts field-for-field — see CMS_MIGRATION.md.
export default defineType({
  name: "workshop",
  title: "Workshop",
  type: "document",
  fields: [
    defineField({ name: "title", title: "Title", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title" },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      options: { list: ["coming-soon", "open", "full", "closed", "completed"] },
      initialValue: "coming-soon",
      validation: (r) => r.required(),
    }),
    defineField({ name: "shortDescription", title: "Short Description", type: "text", rows: 2, validation: (r) => r.required() }),
    defineField({ name: "description", title: "Description", type: "text", rows: 6, validation: (r) => r.required() }),
    defineField({
      name: "categories",
      title: "Categories",
      type: "array",
      of: [{ type: "reference", to: [{ type: "workshopCategory" }] }],
    }),
    defineField({
      name: "instructors",
      title: "Instructors",
      type: "array",
      of: [{ type: "reference", to: [{ type: "instructor" }] }],
    }),
    defineField({ name: "venue", title: "Venue", type: "reference", to: [{ type: "venue" }] }),
    defineField({ name: "capacity", title: "Capacity", type: "number", validation: (r) => r.required().min(1) }),
    defineField({ name: "startDate", title: "Start Date", type: "date" }),
    defineField({ name: "endDate", title: "End Date", type: "date" }),
    defineField({ name: "registrationDeadline", title: "Registration Deadline", type: "date" }),
    defineField({
      name: "experienceLevels",
      title: "Experience Levels",
      type: "array",
      of: [{ type: "string" }],
      options: { list: ["beginner", "intermediate", "advanced", "all-levels"] },
    }),
    defineField({ name: "requiresPayment", title: "Requires Payment", type: "boolean", initialValue: false }),
    defineField({ name: "learningOutcomes", title: "Learning Outcomes", type: "array", of: [{ type: "string" }] }),
    defineField({
      name: "agenda",
      title: "Agenda",
      type: "array",
      of: [
        {
          type: "object",
          name: "agendaItem",
          fields: [
            defineField({ name: "time", title: "Time", type: "string" }),
            defineField({ name: "title", title: "Title", type: "string" }),
            defineField({ name: "description", title: "Description", type: "text", rows: 2 }),
          ],
        },
      ],
    }),
    defineField({ name: "gallery", title: "Gallery", type: "array", of: [{ type: "galleryImage" }] }),
    defineField({
      name: "faqs",
      title: "FAQs",
      type: "array",
      of: [
        {
          type: "object",
          name: "faqItem",
          fields: [
            defineField({ name: "question", title: "Question", type: "string" }),
            defineField({ name: "answer", title: "Answer", type: "text", rows: 3 }),
          ],
        },
      ],
    }),
    defineField({
      name: "certificate",
      title: "Certificate",
      type: "object",
      fields: [
        defineField({ name: "offered", title: "Offered", type: "boolean", initialValue: false }),
        defineField({ name: "description", title: "Description", type: "text", rows: 2 }),
      ],
    }),
    defineField({
      name: "testimonials",
      title: "Testimonials",
      type: "array",
      of: [{ type: "reference", to: [{ type: "testimonial" }] }],
    }),
    defineField({
      name: "sponsors",
      title: "Sponsors",
      type: "array",
      of: [{ type: "reference", to: [{ type: "sponsor" }] }],
    }),
    defineField({
      name: "relatedWorkshops",
      title: "Related Workshops",
      type: "array",
      of: [{ type: "reference", to: [{ type: "workshop" }] }],
    }),
    defineField({ name: "isRecurring", title: "Recurring", type: "boolean", initialValue: false }),
    defineField({ name: "recurrenceNote", title: "Recurrence Note", type: "string" }),
    defineField({ name: "isOnlineAttendancePossible", title: "Online Attendance Possible", type: "boolean", initialValue: false }),
    defineField({ name: "hasRecordedSession", title: "Recorded Session Available", type: "boolean", initialValue: false }),
    defineField({ name: "isMembersOnly", title: "Members Only", type: "boolean", initialValue: false }),
    defineField({ name: "seo", title: "SEO", type: "seo" }),
  ],
  preview: { select: { title: "title", subtitle: "status" } },
});
