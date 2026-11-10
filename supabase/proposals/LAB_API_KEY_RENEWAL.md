# Local lab API keys: why they expire, how to renew them, and why they can never touch Production (10 Nov 2026)

## What expires
The local walkthrough lab (the throwaway Docker database `p4_e2e`, its PostgREST and auth containers, and the app on localhost:3000) authenticates the app with two JWT API keys held in the lab app's `.env.local` (git-ignored): `SUPABASE_SECRET_KEY` (role service_role) and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (role anon). They carry an expiry. When they lapse every server-side read fails with "JWT expired" and Admin pages look empty or half-empty (it first happened on 10 Nov at 10:12 UTC). Nothing is wrong with the data.

## Symptoms
Admin pages load but panels are missing; the dev log shows `[organization] failed to check authority … JWT expired`; the auth container log shows `token has invalid claims: token is expired` on `/admin/users/...`.

## Renewal (about one minute, lab only)
1. `cd /Users/myli/ordift-walkthrough-kit && ./renew_lab_keys.sh` — prints only the role and the new expiry date of each key. 2. `./start.sh` — restarts the lab gateway and app so they read the new keys. 3. Reload the browser; sign in again if asked.
The script: refuses unless `NEXT_PUBLIC_SUPABASE_URL` in the env file is a local address; reads the lab's own signing secret inside a single process from the lab PostgREST container and never prints it or any key; rewrites only those two lines; sets a 30-day expiry and the marker claim `ordift_env: "lab"`. Do not paste keys into chat, tickets or commits. The env file is git-ignored; check with `git check-ignore .env.local`.

## Why a development key cannot be used against Production
1. **Cryptography:** a real Supabase project verifies keys with its own signing secret. The lab's secret exists only inside the lab containers, so a lab key is rejected by any real project.
2. **Application guard (new, tested):** `src/lib/supabase/envGuard.ts`, called when the server creates an admin or user client. A key marked `ordift_env = "lab"` is refused unless the project URL is a local address; a lab key is refused in any deployment with `SITE_ENV=production`; a production deployment pointing at a local address is refused. The check happens before any request is sent, so even a lab key pasted next to a real project URL never leaves the machine. (Keys minted before 10 Nov carry no marker; run the renewal once to add it.)
3. **Hygiene:** never copy `.env.local` values into Vercel or any hosted environment; Production secrets are only ever set through the hosting platform's own interface, per AGENTS.md. The lab database holds synthetic data only.
