#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). 0186 .. 0190 + 0191 + its checks on the scratch database p4_e2e inside ONE transaction that is ROLLED BACK. Synthetic evidence only.
#   apply    : the layers, 0191, the checks         rollback : 0191 only, then its ROLLBACK script; checks everything of 0191 is gone and the 0186/0190 guards, the 0189 event list and the original storage MIME list are restored EXACTLY
#   refuses  : after the checks linked statement evidence, the ROLLBACK script must REFUSE (evidence is never orphaned)
#   verifier : self-test: the "everything is gone" check MUST fail while 0191 is still applied
# Usage: rehearse_statement_evidence.sh [apply|rollback|refuses|verifier] [db] [container]
M=${1:-apply}; DB=${2:-p4_e2e}; C=${3:-ordift-mig-check2}; D="$(cd "$(dirname "$0")" && pwd)"; MG="$D/../migrations"
strip() { grep -v -E "^(begin|commit);\$" "$1"; }
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
has() { [ "$(printf "select to_regclass('$1') is not null;" | q)" = t ]; }
pre() { has public.entity_asset_ownership && strip "$D/ROLLBACK_asset_ownership_and_acquisition_link.sql"; has public.entity_acquisition_payments && strip "$D/ROLLBACK_acquisition_payment_arrangements.sql"; has public.entity_equipment_acquisitions && strip "$D/ROLLBACK_equipment_acquisitions_and_financing.sql"; true; }
layers() { for f in 0186_equipment_acquisitions_and_financing 0187_acquisition_payment_arrangements 0188_asset_ownership_and_acquisition_link 0189_founder_ownership_and_unlink 0190_void_acquisition_with_financing; do strip "$MG/$f.sql"; done; }
P="$MG/0191_statement_evidence_link.sql"; R="$D/ROLLBACK_statement_evidence_link.sql"; B="$D/REHEARSE_statement_evidence_body.sql"
snap="insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('legal-entity-documents','legal-entity-documents',false,10485760,array['application/pdf','image/jpeg','image/png']) on conflict (id) do update set allowed_mime_types = array['application/pdf','image/jpeg','image/png']; create temp table t_g as select md5(pg_get_functiondef('private.acquisitions_guard()'::regprocedure)) ga, md5(pg_get_functiondef('private.instalments_guard()'::regprocedure)) gi, (select pg_get_constraintdef(oid) from pg_constraint where conname = 'entity_finance_events_event_type_check') ev; grant all on t_g to public;"
gone=$(cat <<'SQL'
do $$ begin
  if to_regprocedure('public.link_statement_evidence(text, uuid, uuid, jsonb, uuid)') is not null or to_regprocedure('public.unlink_statement_evidence(text, uuid, text, uuid)') is not null then raise exception 'ROLLBACK LEFT: the statement functions'; end if;
  if to_regprocedure('private.holder_key(text)') is not null or to_regprocedure('private.looks_unmasked(text)') is not null then raise exception 'ROLLBACK LEFT: the helpers'; end if;
  if pg_get_functiondef('private.instalments_guard()'::regprocedure) ilike '%ordift.unlink_evidence%' or pg_get_functiondef('private.acquisitions_guard()'::regprocedure) ilike '%ordift.unlink_evidence%' then raise exception 'ROLLBACK LEFT: guard exception'; end if;
  if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'entity_finance_events_event_type_check') ilike '%bank_evidence_unlinked%' then raise exception 'ROLLBACK LEFT: event type'; end if;
  if (select allowed_mime_types from storage.buckets where id = 'legal-entity-documents') @> array['message/rfc822'] then raise exception 'ROLLBACK LEFT: e-mail MIME type'; end if;
  if to_regclass('public.entity_financing_instalments') is null or to_regprocedure('public.void_equipment_acquisition(uuid, text, uuid)') is null then raise exception 'ROLLBACK REMOVED TOO MUCH'; end if;
end $$;
SQL
)
same="do \$\$ begin if (select ga from t_g) <> md5(pg_get_functiondef('private.acquisitions_guard()'::regprocedure)) then raise exception 'the 0186 acquisitions guard was NOT restored exactly'; end if; if (select gi from t_g) <> md5(pg_get_functiondef('private.instalments_guard()'::regprocedure)) then raise exception 'the 0190 instalments guard was NOT restored exactly'; end if; if (select ev from t_g) <> (select pg_get_constraintdef(oid) from pg_constraint where conname = 'entity_finance_events_event_type_check') then raise exception 'the 0189 event list was NOT restored exactly'; end if; if (select allowed_mime_types from storage.buckets where id = 'legal-entity-documents') <> array['application/pdf','image/jpeg','image/png'] then raise exception 'the storage MIME list was NOT restored exactly'; end if; end \$\$;"
case "$M" in
  apply)    { echo "begin;"; pre; layers; echo "$snap"; strip "$P"; cat "$B"; echo "rollback;"; } | q ;;
  rollback) { echo "begin;"; pre; layers; echo "$snap"; strip "$P"; strip "$R"; echo "$gone"; echo "$same"; echo "rollback;"; } | q ;;
  refuses)  { echo "begin;"; pre; layers; echo "$snap"; strip "$P"; cat "$B"; echo "select pg_temp.must(pg_temp.err(\$qq\$$(strip "$R")\$qq\$) ilike '%rollback refused%', 'the ROLLBACK script refuses once statement evidence was linked/unlinked');"; echo "rollback;"; } | q ;;
  verifier) { echo "begin;"; pre; layers; echo "$snap"; strip "$P"; echo "$gone"; echo "rollback;"; } | q ;;
  *) echo "usage: $0 apply|rollback|refuses|verifier"; exit 2 ;;
esac
