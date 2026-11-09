"use client";

import { useState, useTransition } from "react";
import { searchClientsAction } from "../clientLookupActions";
import type { StaffClientMatch } from "@/lib/enquiry/staffClientLookupRules";

// Read-only "Find an existing client" for staff recording an enquiry. It shows a name, the organisation, one masked identifier and how many earlier enquiries exist.
// Choosing a client sets a hidden field; the enquiry is linked to that existing client when it is recorded. It cannot show or change the client's details.
const FIELD = "rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small";
const KIND: Record<string, string> = { email: "email", phone: "phone number", name: "name" };

export default function ClientLookupPanel() {
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const [results, setResults] = useState<StaffClientMatch[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<StaffClientMatch | null>(null);

  const search = () => start(async () => {
    setError(null); setResults(null);
    const r = await searchClientsAction(query);
    if (!r.ok) { setError(r.error); return; }
    setResults(r.results); setMore(r.moreMatches);
  });

  return (
    <fieldset className="sm:col-span-2 rounded-lg border border-black/10 p-4 space-y-3">
      <legend className="px-1 font-sans text-body-small font-medium text-ordift-ink">Is this an existing client? (read-only)</legend>
      <input type="hidden" name="existingContactId" value={chosen?.contactId ?? ""} />
      {chosen ? (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 font-sans text-body-small text-green-900" role="status">
          <p>This enquiry will be linked to the existing client <strong>{chosen.displayName}</strong>{chosen.organisationName ? ` (${chosen.organisationName})` : ""}{chosen.maskedEmail ? ` · ${chosen.maskedEmail}` : chosen.maskedPhone ? ` · ${chosen.maskedPhone}` : ""}. No new client is created.</p>
          <button type="button" className="mt-2 underline" onClick={() => { setChosen(null); }}>Choose a different client</button>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="sr-only" htmlFor="client-lookup-q">Search by name, phone number or complete email</label>
            <input id="client-lookup-q" type="text" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }}
              placeholder="Name, phone number or complete email address" className={`${FIELD} flex-1`} maxLength={60} />
            <button type="button" onClick={search} disabled={pending || query.trim().length === 0} className="min-h-11 px-5 rounded-full border border-black/20 font-sans text-body-small disabled:opacity-50">{pending ? "Searching…" : "Search"}</button>
          </div>
          <div aria-live="polite">
            {error ? <p role="alert" className="font-sans text-caption text-red-700">{error}</p> : null}
            {results && results.length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">No existing client found. Record the enquiry as normal.</p> : null}
            {results && results.length > 0 ? (
              <ul className="space-y-2">
                {results.map((m) => (
                  <li key={m.contactId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-2 font-sans text-body-small text-ordift-ink">
                    <span>
                      <strong>{m.displayName}</strong>{m.organisationName ? ` · ${m.organisationName}` : ""}
                      <span className="block text-caption text-ordift-ink-muted">Matched on {KIND[m.matchedBy]}{m.maskedEmail ? ` · ${m.maskedEmail}` : ""}{m.maskedPhone ? ` · ${m.maskedPhone}` : ""} · {m.earlierEnquiries} earlier {m.earlierEnquiries === 1 ? "enquiry" : "enquiries"}</span>
                    </span>
                    <button type="button" className="min-h-9 px-4 rounded-full bg-ordift-navy-950 text-white text-caption" onClick={() => setChosen(m)}>This is the client</button>
                  </li>
                ))}
                {more ? <li className="font-sans text-caption text-ordift-ink-muted">There are more matches. Add a phone number or the complete email address to narrow it down.</li> : null}
              </ul>
            ) : null}
          </div>
          <label className="flex items-start gap-2 font-sans text-caption text-ordift-ink-muted">
            <input type="checkbox" name="confirmedDifferentClient" className="mt-0.5" />
            This is a different person from any existing client (needed only if the email or phone you type below matches one).
          </label>
        </>
      )}
      <p className="font-sans text-caption text-ordift-ink-muted">Shows only a name, the organisation, one partly hidden identifier and the number of earlier enquiries. Every search is recorded. You cannot see or change a client&apos;s details here.</p>
    </fieldset>
  );
}
