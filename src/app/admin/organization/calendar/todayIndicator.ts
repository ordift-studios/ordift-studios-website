// Today-indicator pure logic (2026-09-15 UX enhancement) — extracted
// from CalendarMonthView.tsx so the date-correctness properties that
// actually matter (local-time formatting, exact-date matching across
// months/years) are directly unit-testable without rendering React/DOM
// — this codebase has no @testing-library/react dependency and no
// other .test.tsx anywhere, so component rendering is verified by code
// reading elsewhere (established convention), while genuinely pure
// logic like this is always given a real test.

// Formats a Date using its LOCAL calendar fields (getFullYear/getMonth/
// getDate), never the UTC accessors. This is the one deliberate
// exception to this codebase's usual UTC-only date handling
// (attendanceClassification.ts uses UTC accessors specifically because
// Ghana has zero UTC offset year-round — not a general solution, and
// wrong for Qatar/UK/US). "Today" is a browser-viewer-facing concept:
// calling this with `new Date()` inside a client-only effect reads the
// VIEWER's actual local calendar date, correct for any timezone,
// without inventing a company-wide timezone policy this codebase does
// not otherwise have.
export function formatLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Whether a calendar cell's date is "today" — exact full-date string
// equality, so the same day-of-month number in a different month or
// year never matches, and a null todayDateString (before the
// client-only effect has run, i.e. the initial server-rendered pass)
// never highlights anything, avoiding a server/client hydration
// mismatch.
export function isTodayCell(cellDateString: string, todayDateString: string | null): boolean {
  if (!todayDateString) return false;
  return cellDateString === todayDateString;
}
