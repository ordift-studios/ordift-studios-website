#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). 0186 + 0187 + 0188 + 0189 + 0190 + its checks on the scratch database p4_e2e inside ONE transaction that is ROLLED BACK.
#   apply    : the layers, 0190, the checks         rollback : 0190 only, then its ROLLBACK script; checks everything of 0190 is gone and the 0186 guard/constraint are restored EXACTLY
#   refuses  : after the checks voided data, the ROLLBACK script must REFUSE (the correction history is never lost)
#   verifier : self-test: the "everything is gone" check MUST fail while 0190 is still applied
# Usage: rehearse_void_acquisition.sh [apply|rollback|refuses|verifier] [db] [container]
M=${1:-apply}; DB=${2:-p4_e2e}; C=${3:-ordift-mig-check2}; D="$(cd "$(dirname "$0")" && pwd)"; MG="$D/../migrations"
strip() { grep -v -E "^(begin|commit);\$" "$1"; }
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
has() { [ "$(printf "select to_regclass('$1') is not null;" | q)" = t ]; }
pre() { has public.entity_asset_ownership && strip "$D/ROLLBACK_asset_ownership_and_acquisition_link.sql"; has public.entity_acquisition_payments && strip "$D/ROLLBACK_acquisition_payment_arrangements.sql"; has public.entity_equipment_acquisitions && strip "$D/ROLLBACK_equipment_acquisitions_and_financing.sql"; true; }
layers() { strip "$MG/0186_equipment_acquisitions_and_financing.sql"; strip "$MG/0187_acquisition_payment_arrangements.sql"; strip "$MG/0188_asset_ownership_and_acquisition_link.sql"; strip "$MG/0189_founder_ownership_and_unlink.sql"; }
P="$MG/0190_void_acquisition_with_financing.sql"; R="$D/ROLLBACK_void_acquisition_with_financing.sql"; B="$D/REHEARSE_void_acquisition_body.sql"
O186=$(python3 - "$MG/0186_equipment_acquisitions_and_financing.sql" <<'PY'
import sys
t=open(sys.argv[1]).read(); s=t.index("create or replace function private.instalments_guard()"); e=t.index("revoke all on function private.instalments_guard()")
print(t[s:e].strip().replace("'","''"))
PY
)
snap="create temp table t_g as select md5(pg_get_functiondef('private.instalments_guard()'::regprocedure)) g, (select pg_get_constraintdef(oid) from pg_constraint where conname = 'instalments_paid_shape') c; grant all on t_g to public;"
gone=$(cat <<'SQL'
do $$ begin
  if to_regprocedure('public.void_equipment_acquisition(uuid, text, uuid)') is not null then raise exception 'ROLLBACK LEFT: void_equipment_acquisition'; end if;
  if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'instalments_paid_shape') ilike '%status = ''void''%' then raise exception 'ROLLBACK LEFT: relaxed paid-shape constraint'; end if;
  if pg_get_functiondef('private.instalments_guard()'::regprocedure) ilike '%ordift.void_acquisition%' then raise exception 'ROLLBACK LEFT: guard exception'; end if;
  if to_regclass('public.entity_financing_instalments') is null or to_regclass('public.entity_asset_ownership') is null or to_regprocedure('public.unlink_acquisition_from_asset(uuid, text, uuid)') is null then raise exception 'ROLLBACK REMOVED TOO MUCH'; end if;
end $$;
SQL
)
case "$M" in
  apply)    { echo "begin;"; pre; layers; strip "$P"; cat "$B"; echo "rollback;"; } | q ;;
  rollback) { echo "begin;"; pre; layers; echo "$snap"; strip "$P"; strip "$R"; echo "$gone"; echo "do \$\$ begin if (select g from t_g) <> md5(pg_get_functiondef('private.instalments_guard()'::regprocedure)) then raise exception 'the 0186 instalment guard was NOT restored exactly'; end if; if (select c from t_g) <> (select pg_get_constraintdef(oid) from pg_constraint where conname = 'instalments_paid_shape') then raise exception 'the 0186 paid-shape constraint was NOT restored exactly'; end if; end \$\$;"; echo "rollback;"; } | q ;;
  refuses)  { echo "begin;"; pre; layers; strip "$P"; cat "$B"; echo "select pg_temp.must(pg_temp.err(\$qq\$$(strip "$R")\$qq\$) ilike '%rollback refused%', 'the ROLLBACK script refuses once an acquisition was voided through 0190');"; echo "rollback;"; } | q ;;
  verifier) { echo "begin;"; pre; layers; strip "$P"; echo "$gone"; echo "rollback;"; } | q ;;
  *) echo "usage: $0 apply|rollback|refuses|verifier"; exit 2 ;;
esac
