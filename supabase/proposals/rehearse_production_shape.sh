#!/bin/bash
# LOCAL ONLY (never Production). Builds a PRODUCTION-SHAPED scratch database: the lab schema copy + migrations 0168-0173 (e2e_scratch.sh) + the migrations Production has applied since, in ledger order:
# 0174, 0175, 0177-0184 from origin/main and 0185 from the release branch whose file hash is the one recorded in the 0185 release plan. (0176 was never applied to Production.)
# After it runs, p4_e2e matches Production's migration level (ledger 0185 / 177 versions) closely enough to rehearse the finance and stamp proposals:
#   supabase/proposals/rehearse_production_shape.sh && supabase/proposals/rehearse_finance.sh apply && supabase/proposals/rehearse_finance.sh rollback  (and the same for rehearse_stamp.sh)
# Refuses to continue if the 0185 file's SHA-256 is not the recorded one. Prints only object names and results; nothing here can reach Staging or Production.
set -e
D="$(cd "$(dirname "$0")" && pwd)"; R="$(cd "$D/../.." && pwd)"; C=${LAB_DB_CONTAINER:-ordift-mig-check2}; DB=p4_e2e
EXPECT_0185=abb02940841efc67731f04ebc1a037d27d05bb0103526051ac3ff2ff71b4b4c5; BRANCH_0185=${BRANCH_0185:-local/release-0185-0186}
"$D/e2e_scratch.sh" > /tmp/prodshape_base.out 2>&1 || { tail -5 /tmp/prodshape_base.out; echo "could not build the base scratch database"; exit 1; }
apply() { # $1 = label, stdin = SQL
  if docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -q -v ON_ERROR_STOP=1 >/tmp/prodshape_step.out 2>&1; then echo "applied  $1"; else echo "FAILED   $1"; grep -E "ERROR|DETAIL|CONTEXT" /tmp/prodshape_step.out | head -4; exit 1; fi; }
for f in $(git -C "$R" ls-tree --name-only origin/main supabase/migrations/ | sed 's#.*/##' | sort); do
  v=${f%%_*}; case "$v" in 0174|0175|0177|0178|0179|0180|0181|0182|0183|0184) git -C "$R" show "origin/main:supabase/migrations/$f" | apply "$f";; esac
done
M85=$(git -C "$R" show "$BRANCH_0185:supabase/migrations/0185_trusted_actor_tickets.sql")
[ "$(printf '%s\n' "$M85" | shasum -a 256 | cut -c1-64)" = "$EXPECT_0185" ] || [ "$(git -C "$R" show "$BRANCH_0185:supabase/migrations/0185_trusted_actor_tickets.sql" | shasum -a 256 | cut -c1-64)" = "$EXPECT_0185" ] || { echo "STOP: the 0185 file is not the recorded one"; exit 1; }
git -C "$R" show "$BRANCH_0185:supabase/migrations/0185_trusted_actor_tickets.sql" | apply "0185_trusted_actor_tickets.sql"
docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d "$DB" -X -At -c "select 'objects present: 0174 columns '||(select count(*) from information_schema.columns where table_name='entity_expenses' and column_name='reimbursement_intent')||', pdf editions '||(to_regclass('public.pdf_document_editions') is not null)||', signature vault '||(to_regclass('public.signature_assets') is not null)||', instructor standards '||(to_regclass('public.instructor_standards_versions') is not null)||', subject permissions '||(to_regclass('public.portfolio_subject_permissions') is not null)||', jurisdiction requirements '||(to_regclass('public.jurisdiction_entity_requirements') is not null)"
echo "PRODUCTION-SHAPED scratch database ready (p4_e2e). Finance and stamp objects are NOT in it: rehearse them next."
