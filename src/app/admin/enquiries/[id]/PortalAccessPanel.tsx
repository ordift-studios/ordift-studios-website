import { loadPortalAccess } from "@/lib/portal/claimService";
import { CHANNEL_LABELS, type ClaimChannel } from "@/lib/portal/claims";
import { CreateInvitationForm, ReleaseOwnershipForm, RevokeInvitationForm } from "./PortalAccessForms";

const when = (iso: string) => `${new Date(iso).toISOString().replace("T", " ").slice(0, 16)} UTC`;
const STATUS: Record<string, string> = { open: "Open", claimed: "Claimed by the client", revoked: "Revoked", expired: "Expired", locked: "Locked (too many wrong codes)" };

// "Client portal access": how a client comes to own this project online. Staff never grant access directly: they issue a one-time link and code, and the client proves they hold it from their own account.
export default async function PortalAccessPanel({ enquiryId, viewerId, isSuperAdmin }: { enquiryId: string; viewerId: string; isSuperAdmin: boolean }) {
  const v = await loadPortalAccess(enquiryId, viewerId);
  const open = v.invitations.find((i) => i.status === "open");
  return (
    <section className="space-y-4 rounded-xl border border-black/10 bg-white p-6" aria-labelledby="portal-access-heading">
      <div>
        <h2 id="portal-access-heading" className="font-serif font-medium text-body text-ordift-ink">Client portal access</h2>
        <p className="mt-1 font-sans text-caption text-ordift-ink-muted">A client does not need an account to enquire or to receive a quotation. To pay online they need their own account to OWN this project. It is never linked from an email address or a phone number: you give the client a one-time link and a 6-digit code, and they enter it from their own account.</p>
      </div>
      {v.tableMissing ? (
        <p className="rounded-lg bg-amber-50 p-3 font-sans text-caption text-amber-900">Portal invitations are not available in this database yet (the portal-claims migration is not applied).</p>
      ) : v.owner ? (
        <>
          <p className="font-sans text-body-small text-ordift-ink">Linked to the client&apos;s portal account <strong>{v.owner.label}</strong>. The client can see this project and pay it online.</p>
          {isSuperAdmin && <details className="rounded-lg border border-black/10 p-3"><summary className="cursor-pointer font-sans text-caption font-medium">Wrong person? Release this project (Super Admin)</summary><div className="mt-3"><ReleaseOwnershipForm enquiryId={enquiryId} /></div></details>}
        </>
      ) : open ? (
        <p className="font-sans text-body-small text-ordift-ink">An invitation is open (see below). To issue a new one, revoke it first: a code cannot be shown again.</p>
      ) : (
        <CreateInvitationForm enquiryId={enquiryId} defaultChannel={v.sourceChannel ?? "whatsapp"} />
      )}
      {v.invitations.length > 0 && (
        <div>
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Invitations</p>
          <ul className="mt-2 space-y-2">
            {v.invitations.map((i) => (
              <li key={i.id} className="rounded-lg border border-black/10 p-3 font-sans text-caption text-ordift-ink">
                <strong>{STATUS[i.status] ?? i.status}</strong> · {CHANNEL_LABELS[i.channel as ClaimChannel] ?? i.channel} · issued {when(i.createdAt)} by {i.createdByLabel ?? "staff"} · expires {when(i.expiresAt)} · wrong codes {i.attempts}{i.riskLevel === "elevated" ? " · extra care" : ""}
                {i.canRevoke && <div className="mt-2"><RevokeInvitationForm enquiryId={enquiryId} claimId={i.id} /></div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {v.events.length > 0 && (
        <div>
          <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted">Ownership history (kept permanently)</p>
          <ul className="mt-2 space-y-1 font-sans text-caption text-ordift-ink-muted">{v.events.map((e, i) => <li key={i}>{when(e.at)} · {e.event === "claimed" ? "claimed by the client" : "released"} · {e.actorLabel ?? "?"}{e.reason ? ` · ${e.reason}` : ""}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
