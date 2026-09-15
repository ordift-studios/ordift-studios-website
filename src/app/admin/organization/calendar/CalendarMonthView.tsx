"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import type { DateResolution } from "@/lib/organization/workingDayCalendar";
import { formatLocalDateString, isTodayCell } from "./todayIndicator";

// PRE_EMPLOYMENT/POST_EMPLOYMENT deliberately use a neutral slate
// treatment, never the red UNRESOLVED styling (2026-09-15 semantic
// correction) — a date outside someone's employment period is not a
// configuration problem, and must not read as one.
const CLASSIFICATION_STYLES: Record<DateResolution["classification"], string> = {
  PRE_EMPLOYMENT: "bg-slate-50 text-slate-500 border-slate-200",
  WORKING_DAY: "bg-white text-ordift-ink border-black/10",
  SHIFT_WORKING_DAY: "bg-white text-ordift-ink border-black/10",
  REST_DAY: "bg-ordift-offwhite text-ordift-ink-muted border-black/5",
  PUBLIC_HOLIDAY: "bg-amber-50 text-amber-900 border-amber-200",
  COMPANY_CLOSURE: "bg-blue-50 text-blue-900 border-blue-200",
  SPECIAL_SCHEDULE: "bg-purple-50 text-purple-900 border-purple-200",
  POST_EMPLOYMENT: "bg-slate-50 text-slate-500 border-slate-200",
  UNRESOLVED: "bg-red-50 text-red-700 border-red-200",
};

const CLASSIFICATION_LABELS: Record<DateResolution["classification"], string> = {
  PRE_EMPLOYMENT: "Pre-employment",
  WORKING_DAY: "Working day",
  SHIFT_WORKING_DAY: "Scheduled shift",
  REST_DAY: "Rest day",
  PUBLIC_HOLIDAY: "Public holiday",
  COMPANY_CLOSURE: "Company closure",
  SPECIAL_SCHEDULE: "Special schedule",
  POST_EMPLOYMENT: "Post-employment",
  UNRESOLVED: "Unconfigured",
};

// Today's date as "YYYY-MM-DD" in the VIEWER's own browser-local
// timezone (2026-09-15 Today-indicator addition). No canonical
// per-user/company timezone architecture exists anywhere in this
// codebase yet — grep-confirmed; the one precedent
// (attendanceClassification.ts) deliberately uses UTC accessors only
// because Ghana has zero UTC offset year-round, which is not a general
// solution and must not be silently relied on here (Qatar/UK/US would
// all be wrong). Computing this via `new Date()` inside a client-only
// effect, rather than during render, is the smallest safe browser-
// local-date behavior available without inventing a company-wide
// timezone policy: it reads the browser's actual local clock, is
// correct for a viewer in any timezone, and never risks a server/
// client hydration mismatch (the initial render highlights nothing
// until this effect runs after mount).
// useSyncExternalStore, not useState+useEffect: "today" is external
// state (the browser's own clock), not something React owns — this is
// the React-recommended shape for a value that must differ between the
// server snapshot (unknown/null, so the initial render highlights
// nothing) and the client snapshot (the viewer's real local date),
// without the extra render pass and lint warning a setState-in-effect
// pattern would produce. No subscription is needed: this is a
// point-in-time read of "today" per mount, not a live clock — matching
// the scope of a small UX enhancement, not a real-time ticker.
function subscribeNever() {
  return () => {};
}
function useTodayDateString(): string | null {
  return useSyncExternalStore(subscribeNever, () => formatLocalDateString(new Date()), () => null);
}

// Read-only month grid (Workforce/Employee Self-Service Phase,
// 2026-09-15) — shared by the self-service (/admin/me/calendar) and
// admin (/admin/organization/calendar/[profileId]) views so there is
// exactly one rendering of "what does a day in this calendar look
// like", never two independently-drifting UIs. Employee editing is
// explicitly out of scope here (Section 19/23 — READ-ONLY from the
// ordinary employee perspective); this component has no form, no
// action, nothing but links to navigate months.
export function CalendarMonthView({
  year,
  month,
  resolutions,
  basePath,
  employeeName,
}: {
  year: number;
  month: number; // 1-12
  resolutions: DateResolution[];
  basePath: string;
  employeeName: string | null;
}) {
  const todayDateString = useTodayDateString();
  const byDate = new Map(resolutions.map((r) => [r.date, r]));
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leadingBlanks = firstOfMonth.getUTCDay() === 0 ? 6 : firstOfMonth.getUTCDay() - 1; // week starts Monday

  const cells: (DateResolution | null)[] = Array.from({ length: leadingBlanks }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push(byDate.get(dateStr) ?? null);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const monthLabel = firstOfMonth.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-serif font-medium text-body text-ordift-ink">
          {employeeName ? `${employeeName} — ${monthLabel}` : monthLabel}
        </h2>
        <div className="flex items-center gap-3">
          <Link href={`${basePath}?year=${prevMonth.year}&month=${prevMonth.month}`} className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">
            ← Previous
          </Link>
          <Link href={`${basePath}?year=${nextMonth.year}&month=${nextMonth.month}`} className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4">
            Next →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="font-sans text-caption font-semibold text-ordift-ink-muted uppercase tracking-wide py-1">
            {d}
          </div>
        ))}
        {cells.map((resolution, i) => {
          if (!resolution) return <div key={`blank-${i}`} className="min-h-[3.5rem] sm:min-h-[4.5rem]" />;

          // Presentation overlay ONLY — never a classification of its
          // own (Section 2's explicit requirement). The cell's
          // background/label below still come entirely from
          // CLASSIFICATION_STYLES/CLASSIFICATION_LABELS, unchanged;
          // isToday only adds a ring and a badge on top.
          const isToday = isTodayCell(resolution.date, todayDateString);
          const label = resolution.holidayName ?? CLASSIFICATION_LABELS[resolution.classification];

          return (
            <div
              key={resolution.date}
              title={isToday ? `${label} — Today` : label}
              aria-current={isToday ? "date" : undefined}
              className={`relative rounded-lg border p-1.5 sm:p-2 min-h-[3.5rem] sm:min-h-[4.5rem] flex flex-col items-start justify-between ${CLASSIFICATION_STYLES[resolution.classification]} ${
                isToday ? "ring-2 ring-green-600 ring-offset-1" : ""
              }`}
            >
              <span className="font-sans text-caption font-semibold flex items-center gap-1">
                {Number(resolution.date.slice(-2))}
                {isToday && (
                  <span className="px-1 py-0.5 rounded bg-green-600 text-white text-[0.55rem] sm:text-[0.6rem] font-semibold uppercase tracking-wide leading-none">
                    Today
                  </span>
                )}
              </span>
              <span className="font-sans text-[0.65rem] sm:text-caption leading-tight">{label}</span>
              {isToday && <span className="sr-only"> — this is today&apos;s date</span>}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 pt-2 border-t border-black/5">
        {(Object.keys(CLASSIFICATION_LABELS) as DateResolution["classification"][]).map((c) => (
          <span key={c} className="flex items-center gap-1.5 font-sans text-caption text-ordift-ink-muted">
            <span className={`inline-block w-3 h-3 rounded border ${CLASSIFICATION_STYLES[c]}`} />
            {CLASSIFICATION_LABELS[c]}
          </span>
        ))}
      </div>
    </div>
  );
}
