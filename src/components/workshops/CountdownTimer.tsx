"use client";

import { useEffect, useState } from "react";

type Remaining = { days: number; hours: number; minutes: number; seconds: number };

function getRemaining(targetIso: string): Remaining | null {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

const UNITS: [keyof Remaining, string][] = [
  ["days", "Days"],
  ["hours", "Hrs"],
  ["minutes", "Min"],
  ["seconds", "Sec"],
];

export default function CountdownTimer({ targetDate, label }: { targetDate: string; label: string }) {
  const [remaining, setRemaining] = useState<Remaining | null>(() => getRemaining(targetDate));

  useEffect(() => {
    const interval = setInterval(() => setRemaining(getRemaining(targetDate)), 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  if (!remaining) return null;

  return (
    <div className="rounded-xl border border-ordift-gold/30 bg-ordift-gold/10 p-4 sm:p-5">
      <p className="font-sans text-caption uppercase tracking-[0.1em] text-ordift-gold-pressed mb-3">
        {label}
      </p>
      <div className="flex gap-4 sm:gap-6">
        {UNITS.map(([key, unitLabel]) => (
          <div key={key} className="text-center">
            <p className="font-serif font-medium text-card-title lg:text-card-title-desktop text-ordift-ink tabular-nums">
              {String(remaining[key]).padStart(2, "0")}
            </p>
            <p className="font-sans text-caption text-ordift-ink-muted">{unitLabel}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
