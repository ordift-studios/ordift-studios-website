# Crew Support local-database E2E

Runs the real Crew Support server code (quotations, acceptance, offers,
payment conditions, confirmation, variations, cancellation) against a
throwaway Postgres built from `supabase/migrations/*` and served by
PostgREST — entirely on this machine. No Staging/Production credentials are
read; email is mocked and captured.

1. Start Docker. Build a Postgres from the same image as the local Supabase
   stack, load the public schema + seed data of the local dev DB, add the
   `storage` stubs, then apply migrations 0028 → latest in order (four
   data-specific HR/legal seed migrations legitimately fail without real
   staff data; they are unrelated to Crew Support).
2. Start `postgrest/postgrest` against it on 127.0.0.1:54998 with a random JWT
   secret; mint `service_role` and `anon` tokens into `/tmp/e2e_service_jwt`
   and `/tmp/e2e_anon_jwt`.
3. `npx vitest run --config vitest.localdb.config.ts`
