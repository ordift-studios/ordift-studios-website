// OS-LGL-010 controlled master: structural split of its extracted text. Pure and read-only - it never edits, re-flows or re-words the master. The
// individual agreement is composed from the master's own title, introduction and operative clauses 1-29 (returned here as the exact original
// lines), while the master's blank template forms (the cover record and Schedules A-F) and its internal counsel-routing notes are left behind.
// Every boundary is an exact heading line that must occur exactly once and in the expected order; if the master does not have precisely this
// shape the split REFUSES and says why, so a re-worded, re-ordered or extended master can never be composed on a guess.

const TITLE = "INSTRUCTOR / WORKSHOP FACILITATOR AGREEMENT";
const VERSION_BANNER = /^OFFICIAL MASTER - VERSION \d+(\.\d+)*$/;
const STATUS_BANNER = "APPROVED - OFFICIAL MASTER";
const COVER_HEADING = "PARTIES & ENGAGEMENT RECORD";
const SCHEDULE_HEADINGS = [
  "SCHEDULE A - INSTRUCTOR PROFILE & MASTER TERMS",
  "SCHEDULE B - WORKSHOP / SESSION SCHEDULE",
  "SCHEDULE C - COMPENSATION, COMPLETION & PAYABLE CONTROL",
  "SCHEDULE D - IP, RECORDING & CONTENT RIGHTS MATRIX",
  "SCHEDULE E - PARTICIPANT, SAFEGUARDING & DATA CONTROLS",
  "SCHEDULE F - JURISDICTION ROUTING NOTES",
] as const;
const CLAUSE_HEADING = /^(\d{1,2})\. [A-Z][A-Z0-9 ,&/'’()-]+$/;
const LAST_CLAUSE_NUMBER = 29;
// An unresolved template placeholder such as [LEGAL ENTITY / REGISTRATION DETAILS] or [DATE].
export const TEMPLATE_PLACEHOLDER = /\[[A-Z][A-Z0-9 /,&:;.()#?'-]{1,120}\]/;

export type InstructorMasterSections = { title: string; introduction: string; clauses: string };
export type SplitResult = { ok: true; sections: InstructorMasterSections } | { ok: false; problems: string[] };

export function splitInstructorMaster(masterText: string): SplitResult {
  const lines = masterText.split(/\r?\n/);
  const problems: string[] = [];
  const indicesOf = (exact: string) => lines.reduce<number[]>((acc, l, i) => (l.trim() === exact ? [...acc, i] : acc), []);
  const only = (exact: string, label: string): number => {
    const at = indicesOf(exact);
    if (at.length !== 1) problems.push(`${label} appears ${at.length} times (expected exactly once)`);
    return at.length === 1 ? at[0] : -1;
  };

  const cover = only(COVER_HEADING, `Heading “${COVER_HEADING}”`);
  const schedules = SCHEDULE_HEADINGS.map((h) => only(h, `Heading “${h}”`));

  const clauseHeadings = lines.flatMap((l, i) => { const m = CLAUSE_HEADING.exec(l.trim()); return m ? [{ n: Number(m[1]), i }] : []; });
  const sequenceOk = clauseHeadings.length === LAST_CLAUSE_NUMBER && clauseHeadings.every((c, k) => c.n === k + 1);
  if (!sequenceOk) problems.push(`Numbered clause headings 1-${LAST_CLAUSE_NUMBER} were not found exactly once each, in order (found ${clauseHeadings.length})`);

  if (problems.length) return { ok: false, problems };

  const firstClause = clauseHeadings[0].i;
  const lastClause = clauseHeadings[clauseHeadings.length - 1].i;
  if (!(cover < firstClause && firstClause < lastClause && lastClause < schedules[0])) problems.push("The cover record, the clauses and Schedule A are not in the expected order");
  if (!schedules.every((s, k) => k === 0 || s > schedules[k - 1])) problems.push("Schedules A-F are not in the expected order");
  if (problems.length) return { ok: false, problems };

  // Title block: exactly title, version banner, status banner, one introductory paragraph - before the cover record.
  const head = lines.slice(0, cover).map((l) => l.trim()).filter(Boolean);
  if (head.length !== 4 || head[0] !== TITLE || !VERSION_BANNER.test(head[1]) || head[2] !== STATUS_BANNER || head[3].length < 40) problems.push("The title block is not the expected title, version banner, status banner and introduction");

  // The status banner repeats once immediately before clause 1; anything else between the cover record and clause 1 would be unreviewed text.
  const beforeFirst = lines.slice(cover + 1, firstClause).map((l) => l.trim()).filter(Boolean);
  if (beforeFirst[beforeFirst.length - 1] !== STATUS_BANNER) problems.push("The status banner does not directly precede clause 1");

  const clauseBlock = lines.slice(firstClause, schedules[0]);
  while (clauseBlock.length && clauseBlock[clauseBlock.length - 1].trim() === "") clauseBlock.pop();
  if (!clauseBlock[clauseBlock.length - 1]?.startsWith("29.6 ")) problems.push("Clause 29.6 is not the last operative clause before Schedule A");
  if (clauseBlock.some((l) => TEMPLATE_PLACEHOLDER.test(l))) problems.push("An unresolved template placeholder appears inside the operative clauses");

  if (problems.length) return { ok: false, problems };
  return { ok: true, sections: { title: head[0], introduction: head[3], clauses: clauseBlock.join("\n") } };
}
