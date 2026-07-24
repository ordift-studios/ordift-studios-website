import { defineField, defineType } from "sanity";

// Singleton. A site-wide dismissible/announcement strip — enabled flag
// keeps it off by default so it never appears until an editor
// deliberately turns it on.
export default defineType({
  name: "announcementBanner",
  title: "Announcement Banner",
  type: "document",
  fields: [
    defineField({ name: "enabled", title: "Enabled", type: "boolean", initialValue: false }),
    defineField({ name: "message", title: "Message", type: "string" }),
    defineField({ name: "cta", title: "Link", type: "ctaButton" }),
    defineField({ name: "startDate", title: "Start Date", type: "date" }),
    defineField({ name: "endDate", title: "End Date", type: "date" }),
  ],
});
