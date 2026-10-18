#!/bin/bash
# LOCAL ONLY: what each database role can actually do with the M2a objects (throwaway Docker Postgres).
C=ordift-mig-check2
for r in service_role authenticated anon; do echo "== $r"
  for q in "select * from public.revise_ordinary_quotation(gen_random_uuid(), gen_random_uuid())" "select count(*) from public.enquiry_amount_events" "insert into public.enquiry_amount_events (enquiry_id,kind,amount_after,source_after,actor_id) values (gen_random_uuid(),'established',1,'manual',gen_random_uuid())"; do
    printf '  %-62s -> ' "${q:0:62}"; docker exec $C psql -U postgres -At -c "set role $r" -c "$q" 2>&1 | grep -vE '^SET$' | head -1; done; done
