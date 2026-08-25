"use client";

import type { Venue, Workshop } from "@/lib/content/types";

const inputClasses = "w-full min-h-10 rounded-lg border border-black/15 bg-white px-3 py-2 font-sans text-body-small text-ordift-ink";

// Workshop Management V1, Phase B (2026-08-25) — plain server-form
// component (submits directly via the `action` prop, no client state),
// matching /admin/organization's established pattern for this
// codebase's simpler admin forms. Covers the core operational fields
// only — see workshopAdmin.ts's header comment for the explicit scope
// decision (rich content stays Studio-edited).
export default function WorkshopForm({
  action,
  workshop,
  venues,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  workshop?: Workshop | null;
  venues: Venue[];
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-6 max-w-3xl">
      {workshop && <input type="hidden" name="id" value={workshop.id} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Title</label>
          <input name="title" required defaultValue={workshop?.title ?? ""} className={inputClasses} />
        </div>
        <div>
          <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Slug (leave blank to auto-generate)</label>
          <input name="slug" defaultValue={workshop?.slug ?? ""} className={inputClasses} />
        </div>
      </div>

      <div>
        <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Short Description</label>
        <textarea name="shortDescription" required rows={2} defaultValue={workshop?.shortDescription ?? ""} className={inputClasses} />
      </div>
      <div>
        <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Full Description</label>
        <textarea name="description" required rows={5} defaultValue={workshop?.description ?? ""} className={inputClasses} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Status</label>
          <select name="status" defaultValue={workshop?.status ?? "coming-soon"} className={inputClasses}>
            <option value="coming-soon">Coming Soon</option>
            <option value="open">Open</option>
            <option value="full">Full</option>
            <option value="closed">Closed</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Venue</label>
          <select name="venueId" defaultValue={workshop?.venueId ?? ""} className={inputClasses}>
            <option value="">Select…</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.format})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Capacity</label>
          <input type="number" name="capacity" min={1} required defaultValue={workshop?.capacity ?? 1} className={inputClasses} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div>
          <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Start Date</label>
          <input type="date" name="startDate" defaultValue={workshop?.startDate ?? ""} className={inputClasses} />
        </div>
        <div>
          <label className="block font-sans text-caption text-ordift-ink-muted mb-1">End Date</label>
          <input type="date" name="endDate" defaultValue={workshop?.endDate ?? ""} className={inputClasses} />
        </div>
        <div>
          <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Registration Opens</label>
          <input type="date" name="registrationOpensAt" defaultValue={workshop?.registrationOpensAt ?? ""} className={inputClasses} />
        </div>
        <div>
          <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Registration Deadline</label>
          <input type="date" name="registrationDeadline" defaultValue={workshop?.registrationDeadline ?? ""} className={inputClasses} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Display Currency (informational only — e.g. QAR, GHS)</label>
          <input name="displayCurrency" defaultValue={workshop?.displayCurrency ?? ""} className={inputClasses} />
        </div>
        <div>
          <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Timezone (e.g. Asia/Qatar)</label>
          <input name="timezone" defaultValue={workshop?.timezone ?? ""} className={inputClasses} />
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input type="checkbox" name="requiresPayment" defaultChecked={workshop?.requiresPayment ?? false} className="w-4 h-4 accent-ordift-gold" />
        <span className="font-sans text-body-small text-ordift-ink">Requires payment</span>
      </label>

      <div>
        <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Attendee Terms / Important Information (shown publicly)</label>
        <textarea name="attendeeTerms" rows={3} defaultValue={workshop?.attendeeTerms ?? ""} className={inputClasses} />
      </div>
      <div>
        <label className="block font-sans text-caption text-ordift-ink-muted mb-1">Internal Notes (Studio-only, never public)</label>
        <textarea name="internalNotes" rows={2} className={inputClasses} />
      </div>

      <p className="font-sans text-caption text-ordift-ink-muted">
        Gallery, agenda, FAQs, testimonials, sponsors, and instructor bios are still edited in Sanity Studio.
      </p>

      <button type="submit" className="inline-flex items-center rounded-full bg-ordift-gold text-ordift-navy-950 font-sans font-semibold text-button px-6 py-2.5">
        {submitLabel}
      </button>
    </form>
  );
}
