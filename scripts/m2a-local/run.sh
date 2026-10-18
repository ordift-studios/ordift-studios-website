#!/bin/bash
# LOCAL ONLY: runs against the throwaway Docker Postgres container, never Staging or Production.
C=ordift-mig-check2
D=$(cd "$(dirname "$0")" && pwd)
run(){ docker exec -i $C psql -U postgres -q -t -A "$@" 2>&1 | grep -E "NOTICE|ERROR|FAIL|=====|reset ok|fixtures ok" | sed 's/^psql:[^ ]* //; s/NOTICE:  //'; }
for f in "$@"; do echo "--- $f"; run < "$D/$f"; done
