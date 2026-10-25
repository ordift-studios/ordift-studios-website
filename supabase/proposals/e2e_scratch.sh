#!/bin/bash
# LOCAL ONLY. Rebuilds a throwaway database `p4_e2e` inside the local lab Postgres container (schema copy + proposed migrations 0168-0172 applied for real),
# and starts a private PostgREST on 127.0.0.1:54997 with a random secret and short-lived tokens in /tmp. Nothing here can reach Staging or Production.
# Then run: E2E_SUPABASE_URL=http://127.0.0.1:54997 npx vitest run --config vitest.localdb.config.ts src/lib/portfolio/library.localdb.e2e.ts src/lib/enquiry/pricingPersistence.localdb.e2e.ts
# Clean up with: ./e2e_scratch.sh down
set -e
C=${LAB_DB_CONTAINER:-ordift-mig-check2}; NET=${LAB_NETWORK:-ordift-e2e}; D="$(cd "$(dirname "$0")" && pwd)"
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 "$@"; }
docker rm -f p4-e2e-rest >/dev/null 2>&1 || true
if [ "$1" = down ]; then q -d postgres -X -q -c "drop database if exists p4_e2e" -c "drop role if exists p4_auth"; echo "scratch database and PostgREST removed"; exit 0; fi
q -d postgres -X -q -c "drop database if exists p4_e2e" -c "create database p4_e2e"
docker exec "$C" pg_dump -U supabase_admin -h 127.0.0.1 -d postgres --schema-only --no-owner --no-privileges -n public -n private -n auth -n storage 2>/dev/null | q -d p4_e2e -X -q >/dev/null 2>&1 || true
docker exec "$C" pg_dump -U supabase_admin -h 127.0.0.1 -d postgres --data-only --no-owner -t public.businesses -t public.roles -t public.currencies -t public.payment_country_config 2>/dev/null | q -d p4_e2e -X -q >/dev/null 2>&1
# privileges on EXISTING objects (the schema copy carries none); the new tables keep only the grants their own migrations give them
q -d p4_e2e -X -q -v ON_ERROR_STOP=1 <<'SQL'
grant usage on schema public, private, auth, storage to service_role, authenticated, anon;
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public' loop execute format('grant select, insert, update, delete on public.%I to service_role', t.tablename); execute format('grant select on public.%I to authenticated', t.tablename); end loop;
end $$;
grant select, update, usage on all sequences in schema public to service_role;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' loop execute format('grant execute on function %s to service_role, authenticated', f.sig); end loop;
end $$;
SQL
# Production's default privileges for new objects in public (read-only check 2026-10-25): anon/authenticated/service_role get TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on every new table, so each migration must revoke them explicitly. Reproduced here.
q -d p4_e2e -X -q -v ON_ERROR_STOP=1 -c "alter default privileges for role supabase_admin in schema public grant truncate, references, trigger, maintain on tables to anon, authenticated, service_role" >/dev/null
for f in 0168_enquiry_pricing_followups.sql 0169_portfolio_library_foundation.sql 0170_portfolio_marketing_permissions.sql 0171_portfolio_internal_approval_and_use.sql 0172_atomic_ordinary_quotation_issuance.sql; do q -d p4_e2e -X -q -v ON_ERROR_STOP=1 < "$D/../migrations/$f" >/dev/null; done
PW=$(python3 -c "import secrets;print(secrets.token_hex(16))"); SECRET=$(python3 -c "import secrets;print(secrets.token_hex(32))")
q -d p4_e2e -X -q -v ON_ERROR_STOP=1 -c "drop role if exists p4_auth" -c "create role p4_auth login noinherit password '$PW'" -c "grant anon, authenticated, service_role to p4_auth" >/dev/null
docker run -d --name p4-e2e-rest --network "$NET" -p 127.0.0.1:54997:3000 -e PGRST_DB_URI="postgres://p4_auth:$PW@$C:5432/p4_e2e" -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$SECRET" public.ecr.aws/supabase/postgrest:v14.5 >/dev/null
python3 - "$SECRET" <<'PY'
import sys,hmac,hashlib,base64,json,time
s=sys.argv[1].encode(); b=lambda x: base64.urlsafe_b64encode(x).rstrip(b"=")
def jwt(role):
    h=b(json.dumps({"alg":"HS256","typ":"JWT"}).encode()); p=b(json.dumps({"role":role,"iss":"p4-e2e","exp":int(time.time())+86400}).encode())
    return (h+b"."+p+b"."+b(hmac.new(s,h+b"."+p,hashlib.sha256).digest())).decode()
open("/tmp/e2e_service_jwt","w").write(jwt("service_role")); open("/tmp/e2e_anon_jwt","w").write(jwt("anon"))
PY
sleep 5; curl -s -o /dev/null -w "PostgREST ready: HTTP %{http_code}\n" -H "Authorization: Bearer $(cat /tmp/e2e_service_jwt)" "http://127.0.0.1:54997/portfolio_candidates?select=id&limit=1"
