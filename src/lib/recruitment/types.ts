// Join Our Team / recruitment applications (2026-08-24). See
// supabase/migrations/0036_recruitment_applications.sql — a
// prospective collaborator's submission, entirely separate from
// Staff/Admin accounts and Meet the Team public profiles.

export const RECRUITMENT_ROLE_OPTIONS = [
  "Photography",
  "Film / Videography",
  "Editing / Post-production",
  "Design",
  "Branding",
  "Content",
  "Talent",
  "Production",
  "Creative Direction",
  "Other",
] as const;

export const RECRUITMENT_ENGAGEMENT_OPTIONS = ["Freelance", "Full-time", "Project-based", "Other"] as const;

export const RECRUITMENT_STATUSES = [
  "new",
  "reviewing",
  "shortlisted",
  "interview",
  "accepted",
  "rejected",
  "archived",
] as const;
export type RecruitmentStatus = (typeof RECRUITMENT_STATUSES)[number];

export const RECRUITMENT_STATUS_LABEL: Record<RecruitmentStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  shortlisted: "Shortlisted",
  interview: "Interview",
  accepted: "Accepted",
  rejected: "Rejected",
  archived: "Archived",
};

// Admin list row — summary only, no file contents.
export type RecruitmentApplicationSummary = {
  id: string;
  fullName: string;
  roleInterest: string;
  location: string | null;
  submittedAt: string;
  status: RecruitmentStatus;
};

// Full admin detail view.
export type RecruitmentApplicationDetail = RecruitmentApplicationSummary & {
  email: string;
  phone: string | null;
  engagementType: string | null;
  intro: string | null;
  experience: string | null;
  portfolioUrl: string | null;
  socialUrl: string | null;
  availability: string | null;
  message: string | null;
  hasPhoto: boolean;
  hasCv: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
};
