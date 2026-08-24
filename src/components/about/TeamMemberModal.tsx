"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import type { PublicTeamMember } from "@/lib/team/types";

// Team member detail overlay (2026-08-24) — same accessible-dialog
// pattern as PhotoLightbox.tsx (the established precedent in this
// codebase): focus moves into the dialog on open, Tab is trapped within
// it, Escape closes, focus restores to whatever triggered it, body
// scroll is locked while open. Renders only fields that actually have
// content — see PublicTeamMember's own contract (getPublicTeamMembers.ts
// already nulls out anything the curation layer didn't allow), so there
// is nothing left to conditionally hide for permission reasons here,
// only for "this field is just empty."
export default function TeamMemberModal({ member, onClose }: { member: PublicTeamMember; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = originalOverflow;
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const meta = [member.department, member.specialty].filter(Boolean).join(" · ");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${member.displayName}'s profile`}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 sm:p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="relative bg-white rounded-lg max-w-lg w-full max-h-[85vh] overflow-y-auto"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 min-h-11 min-w-11 flex items-center justify-center rounded-full text-ordift-ink-muted hover:text-ordift-ink hover:bg-black/5 z-10"
        >
          <span aria-hidden="true" className="text-2xl leading-none">
            &times;
          </span>
        </button>

        <div className="px-8 pt-10 pb-8 text-center">
          <div className="w-28 h-28 rounded-full overflow-hidden bg-black/5 mx-auto mb-5">
            {member.avatarUrl ? (
              <Image
                src={member.avatarUrl}
                alt=""
                width={112}
                height={112}
                className="w-full h-full object-cover"
                style={{ objectPosition: `${member.avatarFocalX}% ${member.avatarFocalY}%` }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-serif text-card-title text-ordift-ink-muted">
                {member.displayName.charAt(0)}
              </div>
            )}
          </div>

          <h2 className="font-serif font-medium text-card-title text-ordift-ink">{member.displayName}</h2>
          {/* Refined metadata (2026-08-24) — same plain, quiet treatment
              as the social handle below (no uppercase/tracking), so
              role/department reads as secondary metadata under the
              name rather than competing with it as a second heading. */}
          {meta && <p className="font-sans text-caption text-ordift-ink-muted mt-2">{meta}</p>}

          {member.bio && (
            <p className="font-sans text-body-small text-ordift-ink mt-5 whitespace-pre-line">{member.bio}</p>
          )}

          {member.favoriteQuote && (
            <p className="font-serif italic text-body text-ordift-ink-muted mt-5">&ldquo;{member.favoriteQuote}&rdquo;</p>
          )}

          {member.funFact && (
            <div className="mt-5 pt-5 border-t border-black/10">
              <p className="font-sans font-semibold uppercase tracking-[0.15em] text-caption text-ordift-gold-pressed mb-1">
                Something you may not know
              </p>
              <p className="font-sans text-body-small text-ordift-ink-muted">{member.funFact}</p>
            </div>
          )}

          {member.socialHandle &&
            (member.socialHandle.startsWith("http") ? (
              <a
                href={member.socialHandle}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-5 font-sans text-caption text-ordift-gold-pressed underline underline-offset-4"
              >
                {member.socialHandle}
              </a>
            ) : (
              <p className="mt-5 font-sans text-caption text-ordift-ink-muted">{member.socialHandle}</p>
            ))}
        </div>
      </div>
    </div>
  );
}
