#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). 0186 .. 0191 + 0192 + its checks on the scratch database p4_e2e inside ONE transaction that is ROLLED BACK. Synthetic evidence only.
#   apply    : the layers, 0192, the checks         rollback : 0192, then its ROLLBACK script; the 0188 function text must be restored EXACTLY (it again accepts a repeated call)
#   verifier : self-test: the "restored" check MUST fail while 0192 is still applied
# Usage: rehearse_asset_link_idempotency.sh [apply|rollback|verifier] [db] [container]
M=${1:-apply}; DB=${2:-p4_e2e}; C=${3:-ordift-mig-check2}; D="$(cd "$(dirname "$0")" && pwd)"; MG="$D/../migrations"
strip() { grep -v -E "^(begin|commit);\$" "$1"; }
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
has() { [ "$(printf "select to_regclass('$1') is not null;" | q)" = t ]; }
pre() { has public.entity_asset_ownership && strip "$D/ROLLBACK_asset_ownership_and_acquisition_link.sql"; has public.entity_acquisition_payments && strip "$D/ROLLBACK_acquisition_payment_arrangements.sql"; has public.entity_equipment_acquisitions && strip "$D/ROLLBACK_equipment_acquisitions_and_financing.sql"; true; }
layers() { for f in 0186_equipment_acquisitions_and_financing 0187_acquisition_payment_arrangements 0188_asset_ownership_and_acquisition_link 0189_founder_ownership_and_unlink 0190_void_acquisition_with_financing 0191_statement_evidence_link; do strip "$MG/$f.sql"; done; }
P="$MG/0192_asset_link_idempotency.sql"; R="$D/ROLLBACK_asset_link_idempotency.sql"; B="$D/REHEARSE_asset_link_idempotency_body.sql"
snap="insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('legal-entity-documents','legal-entity-documents',false,10485760,array['application/pdf','image/jpeg','image/png']) on conflict (id) do nothing; create temp table t_g as select md5(pg_get_functiondef('public.link_acquisition_to_asset(uuid, uuid, uuid)'::regprocedure)) f; grant all on t_g to public;"
gone="do \$\$ begin if pg_get_functiondef('public.link_acquisition_to_asset(uuid, uuid, uuid)'::regprocedure) ilike '%already linked to an asset%' then raise exception 'ROLLBACK LEFT: the new check'; end if; end \$\$;"
same="do \$\$ begin if (select f from t_g) <> md5(pg_get_functiondef('public.link_acquisition_to_asset(uuid, uuid, uuid)'::regprocedure)) then raise exception 'the 0188 function was NOT restored exactly'; end if; end \$\$;"
case "$M" in
  apply)    { echo "begin;"; pre; layers; echo "$snap"; strip "$P"; cat "$B"; echo "rollback;"; } | q ;;
  rollback) { echo "begin;"; pre; layers; echo "$snap"; strip "$P"; strip "$R"; echo "$gone"; echo "$same"; echo "rollback;"; } | q ;;
  verifier) { echo "begin;"; pre; layers; echo "$snap"; strip "$P"; echo "$gone"; echo "rollback;"; } | q ;;
  *) echo "usage: $0 apply|rollback|verifier"; exit 2 ;;
esac
