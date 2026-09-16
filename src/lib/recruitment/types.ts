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

// Semantic status labeling (2026-09-16) — DISPLAY TEXT only, never the
// underlying RecruitmentStatus/DB value ('accepted' stays exactly as
// stored on every historical and future row; the audit trail is
// untouched). "Accepted" read ambiguously — Ordift selected the
// candidate, not the candidate accepting an offer — so the label here
// is "Selected", matching the approved Hiring-stage terminology
// (Hiring Review -> Selected -> Conditional Offer -> ...), while
// RecruitmentStatus/RECRUITMENT_STATUSES/every stored value remain
// literally 'accepted'.
export const RECRUITMENT_STATUS_LABEL: Record<RecruitmentStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  shortlisted: "Shortlisted",
  interview: "Interview",
  accepted: "Selected",
  rejected: "Not Selected",
  archived: "Archived",
};

// Admin list row — summary only, no file contents.
export type RecruitmentApplicationSummary = {
  id: string;
  fullName: string;
  email: string;
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
