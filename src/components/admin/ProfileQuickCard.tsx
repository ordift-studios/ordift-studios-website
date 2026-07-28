"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ProfileCard } from "@/lib/portal/profileCard";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  suspended: "bg-amber-50 text-amber-700 border-amber-200",
  deactivated: "bg-red-50 text-red-700 border-red-200",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-ordift-ink/10 last:border-b-0">
      <span className="font-sans text-eyebrow uppercase tracking-[0.12em] text-ordift-ink-muted">{label}</span>
      <span className="font-sans text-body-small text-ordift-ink text-right">{value}</span>
    </div>
  );
}

export default function ProfileQuickCard({ card }: { card: ProfileCard }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const statusClass = STATUS_STYLES[card.accountStatus] ?? STATUS_STYLES.active;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-sans text-body-small text-white/70 hidden sm:inline hover:text-white underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ordift-gold rounded"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {card.fullName ?? card.email}
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Profile quick card">
          <button
            type="button"
            aria-label="Close profile card"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ordift-navy-950/60 backdrop-blur-sm"
          />
          <div
            ref={panelRef}
            className="absolute right-0 top-0 h-full w-full max-w-sm bg-white shadow-2xl flex flex-col animate-[slide-in_0.2s_ease-out]"
            style={{ animation: "slideInProfileCard 0.2s ease-out" }}
          >
            <style>{`@keyframes slideInProfileCard { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

            <div className="bg-ordift-navy-950 text-white px-6 pt-8 pb-6 relative">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute top-4 right-4 text-white/60 hover:text-white text-lg leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ordift-gold rounded"
              >
                ✕
              </button>

              <div className="flex items-center gap-4">
                {card.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.avatarUrl}
                    alt=""
                    className="w-16 h-16 rounded-full object-cover border-2 border-ordift-gold"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-ordift-gold text-ordift-navy-950 flex items-center justify-center font-serif text-card-title font-medium">
                    {card.initials}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-serif font-medium text-card-title-desktop truncate">
                    {card.fullName ?? "Unnamed account"}
                  </p>
                  <p className="font-sans text-body-small text-white/70 mt-0.5">{card.roleLabel}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <Row label="Member Number" value={card.memberNumber ?? "Not yet assigned"} />
              {card.classificationName && <Row label="Classification" value={card.classificationName} />}
              <Row label="Job Title" value={card.jobTitle ?? "Not set"} />
              <Row label="Department" value={card.department ?? "Not set"} />
              {card.canViewGrade && <Row label="Grade" value={card.grade ? `${card.grade.name} (${card.grade.code})` : "Not assigned"} />}
              <Row label="Date Joined" value={formatDate(card.dateJoined)} />
              <Row label="Platform Tenure" value={card.tenure} />
              <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-ordift-ink/10">
                <span className="font-sans text-eyebrow uppercase tracking-[0.12em] text-ordift-ink-muted">Account Status</span>
                <span className={`font-sans text-eyebrow uppercase tracking-[0.08em] px-2 py-0.5 rounded-full border ${statusClass}`}>
                  {card.accountStatus}
                </span>
              </div>
              <Row label="Last Login" value={card.lastLoginAt ? formatDate(card.lastLoginAt) : "No record"} />
            </div>

            <div className="px-6 py-5 border-t border-ordift-ink/10 flex flex-col gap-2.5">
              <Link
                href={`/admin/profile/${card.id}`}
                className="text-center rounded-full border border-ordift-ink/30 text-ordift-ink font-sans text-button font-semibold py-2.5 hover:border-ordift-ink/60 transition-colors"
              >
                View Full Profile
              </Link>
              <Link
                href={`/admin/profile/${card.id}?edit=1`}
                className="text-center rounded-full bg-ordift-gold text-ordift-navy-950 font-sans text-button font-semibold py-2.5 hover:bg-ordift-gold-hover transition-colors"
              >
                Edit Profile
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
