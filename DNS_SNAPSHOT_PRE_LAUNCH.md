# DNS & Production Configuration Snapshot — Pre-Launch Rollback Reference

**Captured:** 2026-07-26T11:07:25Z, before any DNS changes were made.
**Domain:** `ordiftstudios.com`
**Purpose:** Permanent rollback reference. If the Phase 2 domain connection
ever needs to be undone, this document records the exact state to
restore.

**Do not delete this file.** If DNS is ever changed again after launch,
capture a new dated snapshot rather than overwriting this one.

---

## Registration

| Field | Value |
|---|---|
| Registrar | Squarespace Domains LLC (IANA ID 3827) |
| Registrar URL | https://domains.squarespace.com |
| Registrant Organization | Ordift Studios |
| Registrant location (WHOIS-visible fields only) | State/Province: Doha Municipality; Country: QA — remaining fields privacy-redacted. This may reflect the privacy-proxy's own metadata rather than a real address; not verified further. |
| Created | 2026-07-24T05:40:36Z |
| Registrar expiration | 2027-07-24T05:40:36Z |
| Domain status | `clientTransferProhibited`, `clientDeleteProhibited` |
| DNSSEC | `signedDelegation` |

## Nameservers (unchanged by this launch — Phase 2 does not touch NS records)

```
nsd1.squarespacedns.com.
nsd2.squarespacedns.com.
nsd3.squarespacedns.com.
nsd4.squarespacedns.com.
```

## DNS records at time of snapshot

### A records (root `ordiftstudios.com`)
```
198.185.159.144
198.49.23.145
198.185.159.145
198.49.23.144
```
*(Squarespace's own hosting IP block — these are what Phase 2 changes to point at Vercel.)*

### AAAA records (root)
None found.

### CNAME (`www.ordiftstudios.com`)
```
www.ordiftstudios.com.  CNAME  ext-sq.squarespace.com.
```
*(Squarespace's external-domain mapping service — this is what Phase 2 changes to `cname.vercel-dns.com`.)*

### MX records — **DO NOT MODIFY**
```
1  smtp.google.com.
```
*(Google Workspace's consolidated MX record. This is live production email routing for the business. Phase 2 must never touch this.)*

### TXT records — **DO NOT MODIFY**
```
"v=spf1 include:_spf.google.com ~all"
"google-site-verification=_7ab4gfUdR9BL7G3vQPuyD7J49y6Mli_dXIklthI90s"
```
*(SPF authorizing Google's mail servers to send as this domain, and a Google site-verification token — both tied to the Google Workspace / Google account setup for this domain. Must be preserved exactly.)*

### DKIM
No record found at the standard Google selector (`google._domainkey.ordiftstudios.com`). This means either DKIM signing is not yet enabled in the Google Workspace Admin console for this domain, or it uses a non-default selector. Not something this launch changes or is capable of changing — flagged for the domain owner to check directly in Google Admin (Apps → Google Workspace → Gmail → Authenticate email) if desired, independent of this launch.

### DMARC
No record found at `_dmarc.ordiftstudios.com`. Same status as DKIM — not configured as of this snapshot, not something Phase 2 touches either way. Worth considering as a future hardening step (independent of the website launch), since SPF alone provides weaker anti-spoofing protection than SPF+DKIM+DMARC together.

### CAA
None found — no certificate authority is currently restricted for this domain, so Vercel's automatic Let's Encrypt issuance (Phase 2) will not conflict with any CAA policy.

### SOA
```
nsd1.squarespacedns.com. cloud-dns-hostmaster.google.com. 1 21600 3600 259200 300
```
*(Squarespace's DNS backend appears to run on Google Cloud DNS infrastructure — this is Squarespace's own implementation detail, not evidence of a separate Google Cloud DNS zone under Ordift's direct control.)*

## Current SSL status (pre-launch)

- Issued to: `ordiftstudios.com`
- Issuer: Let's Encrypt (`YR2`)
- Valid: 2026-07-24 → 2026-10-22
- This is Squarespace's own auto-provisioned certificate for its parking page. It becomes irrelevant once DNS points at Vercel — Vercel issues and manages its own Let's Encrypt certificate automatically per Phase 2, no manual cert work needed or possible.

## Current domain routing (pre-launch)

- `ordiftstudios.com` and `www.ordiftstudios.com` both resolve to Squarespace's hosting infrastructure.
- Both currently serve Squarespace's default **"Coming Soon"** parking page (`<title>Coming Soon</title>`, `noindex` meta tag, Squarespace's `parking-page` JS/CSS bundle) — not a real built site. Nothing of content value exists there to lose.
- The domain is **not connected to Vercel** in any way as of this snapshot (confirmed via `vercel domains ls` on the `ordift-studios-website` project: zero domains attached).
- Production is currently reachable only via Vercel's auto-generated `*.vercel.app` URLs.

## Rollback procedure, if ever needed

To fully revert to this snapshot's state:
1. In the Squarespace DNS panel, restore the root A records to the four IPs listed above.
2. Restore the `www` CNAME to `ext-sq.squarespace.com`.
3. Remove `ordiftstudios.com` / `www.ordiftstudios.com` from the Vercel project's domains.
4. MX, SPF, and the Google-verification TXT record were never changed by this launch, so no action is needed for those — they remain exactly as recorded above throughout.
5. Revert `NEXT_PUBLIC_SITE_URL` in production to the previous `*.vercel.app` value if it was changed.
