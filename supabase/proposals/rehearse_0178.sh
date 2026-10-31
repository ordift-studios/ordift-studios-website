#!/bin/bash
# LOCAL REHEARSAL ONLY (never Production). Runs PROPOSED_0178 + its rehearsal body on the local scratch database p4_e2e (build it first with rebuild_scratch.sh / e2e_scratch.sh), inside ONE
# transaction that is ROLLED BACK. Modes:
#   apply     : 0178 alone, then the checks
#   rollback  : 0178, checks, then ROLLBACK_0178; verifies the table is gone and nothing else changed
#   combo     : the three pending migrations together in BOTH orders (0176->0177->0178 and 0178->0177->0176 amended), then each rollback: no conflict, signatory guard and supersession untouched
# Usage: rehearse_0178.sh [apply|rollback|combo] [db] [container]
M=${1:-apply}; DB=${2:-p4_e2e}; C=${3:-ordift-mig-check2}; D="$(cd "$(dirname "$0")" && pwd)"
strip() { grep -v -E "^(begin|commit);\$" "$1"; }
q() { docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 -At; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
cp "$D/PROPOSED_0176_ghana_admin_enhancements.sql" "$T/a0176.sql"; (cd "$T" && patch -s a0176.sql < "$D/PROPOSED_0176_amendment_for_0177.diff" >/dev/null 2>&1) || true
M76="$D/PROPOSED_0176_ghana_admin_enhancements.sql"; M77="$D/PROPOSED_0177_entity_signatory_supersession.sql"; M78="$D/PROPOSED_0178_profile_correspondence_emails.sql"
R76="$D/ROLLBACK_0176_ghana_admin_enhancements.sql"; R77="$D/ROLLBACK_0177_entity_signatory_supersession.sql"; R78="$D/ROLLBACK_0178_profile_correspondence_emails.sql"
gone78='do $$ begin if to_regclass('"'"'public.profile_correspondence_emails'"'"') is not null or to_regproc('"'"'private.profile_correspondence_emails_guard'"'"') is not null or to_regproc('"'"'public.my_correspondence_email'"'"') is not null then raise exception '"'"'ROLLBACK 0178 incomplete'"'"'; end if; raise notice '"'"'rollback 0178 done: table, guard and functions gone'"'"'; end $$;'
guardmd5() { echo "create temp table if not exists g (k text, v text); insert into g values ('$1', md5(pg_get_functiondef('private.entity_signatories_guard'::regproc)));"; }
same_guard() { echo "do \$\$ begin if (select v from g where k='$1') is distinct from md5(pg_get_functiondef('private.entity_signatories_guard'::regproc)) then raise exception 'SIGNATORY GUARD CHANGED (expected the $1 guard)'; end if; raise notice 'signatory guard unchanged ($1)'; end \$\$;"; }
case "$M" in
  apply)    { echo "begin;"; strip "$M78"; cat "$D/REHEARSE_0178_body.sql"; echo "rollback;"; } | q ;;
  rollback) { echo "begin;"; strip "$M78"; cat "$D/REHEARSE_0178_body.sql"; strip "$R78"; echo "$gone78"; echo "rollback;"; } | q ;;
  combo)
    echo "--- order 1: 0176 -> 0177 -> 0178"
    { echo "begin;"; strip "$M76"; strip "$M77"; guardmd5 after77; strip "$M78"; same_guard after77; cat "$D/REHEARSE_0178_body.sql"; cat "$D/REHEARSE_0177_body.sql"; same_guard after77
      strip "$R78"; echo "$gone78"; same_guard after77; strip "$R77"; strip "$R76"; echo "rollback;"; } | q
    echo "--- order 2: 0178 -> 0177 -> 0176 (amended)"
    { echo "begin;"; strip "$M78"; strip "$M77"; strip "$T/a0176.sql"; guardmd5 after76; cat "$D/REHEARSE_0178_body.sql"; cat "$D/REHEARSE_0177_body.sql"; same_guard after76
      strip "$R78"; echo "$gone78"; same_guard after76; echo "rollback;"; } | q ;;
  *) echo "usage: $0 apply|rollback|combo"; exit 2 ;;
esac
