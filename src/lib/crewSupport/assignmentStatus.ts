import type { CrewJobView } from "./crewOfferRules";

// How an assignment is presented in "My Assignments": which group it belongs to, a plain status and the
// next action for the professional. Presentation only — it reads the existing job view and changes
// nothing. (Job-completion reporting and deliverables are added to the next actions in later batches.)
export type AssignmentGroup = "offer" | "active" | "closed";

export type AssignmentSummary = { group: AssignmentGroup; status: string; nextAction: string };

// today = 'YYYY-MM-DD'. Compared as dates; a job spans startDate..endDate inclusive.
export function describeAssignment(job: Pick<CrewJobView, "state" | "startDate" | "endDate" | "jobClosed">, today: string): AssignmentSummary {
  if (job.state === "declined") return { group: "closed", status: "Declined", nextAction: "No action needed." };
  if (job.state === "offered") {
    return job.jobClosed
      ? { group: "closed", status: "Offer closed", nextAction: "No action needed — this request is no longer open." }
      : { group: "offer", status: "Offer waiting for your response", nextAction: "Review the offer and accept or decline it." };
  }
  if (job.jobClosed) return { group: "closed", status: "Closed", nextAction: "No action needed." };
  if (today < job.startDate) return { group: "active", status: "Accepted — upcoming", nextAction: "Review the brief, call time and instructions." };
  if (today <= job.endDate) return { group: "active", status: "Accepted — job day", nextAction: "Open your assignment workspace for the brief and contacts." };
  return { group: "active", status: "Accepted — job date passed", nextAction: "Open your assignment workspace to follow up on files and updates." };
}

export function groupAssignments<T extends Pick<CrewJobView, "state" | "startDate" | "endDate" | "jobClosed">>(jobs: T[], today: string): { offers: T[]; active: T[]; closed: T[] } {
  const out = { offers: [] as T[], active: [] as T[], closed: [] as T[] };
  for (const j of jobs) {
    const g = describeAssignment(j, today).group;
    (g === "offer" ? out.offers : g === "active" ? out.active : out.closed).push(j);
  }
  return out;
}
