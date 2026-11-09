#!/bin/bash
# LOCAL ONLY. Builds a DISPOSABLE copy of the lab database (p4_pvb), runs the payment-vs-booking race on it, drops it. The walkthrough database p4_e2e is only READ (pg_dump).
C=${LAB_DB_CONTAINER:-ordift-mig-check2}; SRC=p4_e2e; COPY=p4_pvb; D="$(cd "$(dirname "$0")" && pwd)"
docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d postgres -X -q -c "drop database if exists $COPY" -c "create database $COPY"
docker exec "$C" pg_dump -U supabase_admin -h 127.0.0.1 -d $SRC --no-owner | docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d $COPY -X -q -v ON_ERROR_STOP=0 >/dev/null 2>&1
rc=0; LAB_DB_NAME=$COPY python3 "$D/rehearse_payment_vs_booking_concurrency.py" || rc=$?
docker exec -i "$C" psql -U supabase_admin -h 127.0.0.1 -d postgres -X -q -c "drop database if exists $COPY"
echo "disposable copy $COPY dropped. exit $rc"; exit $rc
