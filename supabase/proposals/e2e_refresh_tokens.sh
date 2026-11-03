#!/bin/bash
# LOCAL ONLY. The local lab's tokens in /tmp (e2e_service_jwt, e2e_anon_jwt) are deliberately short-lived (24 hours, see e2e_scratch.sh). When they expire, every database call in the
# *.localdb.e2e.ts suites fails with PostgREST "JWT expired", which the application can surface as an unrelated message (for example "Choose a supported currency (GHS, QAR or USD)").
# This mints replacement tokens WITHOUT rebuilding the lab database: it reads the throwaway signing secret from the running lab PostgREST container's own configuration, signs two new
# 24-hour tokens, and writes them to the same two files. The secret is never printed or stored anywhere else. Nothing here can reach Staging or Production.
#
# Run: supabase/proposals/e2e_refresh_tokens.sh        (needs the p4-e2e-rest container from e2e_scratch.sh to be running)
set -e
python3 - <<'PY'
import base64, hashlib, hmac, json, subprocess, time
env = json.loads(subprocess.check_output(["docker", "inspect", "p4-e2e-rest", "--format", "{{json .Config.Env}}"]))
secret = next(e.split("=", 1)[1] for e in env if e.startswith("PGRST_JWT_SECRET="))
b = lambda x: base64.urlsafe_b64encode(x).rstrip(b"=")
def jwt(role):
    h = b(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()); p = b(json.dumps({"role": role, "iss": "p4-e2e", "exp": int(time.time()) + 86400}).encode())
    return (h + b"." + p + b"." + b(hmac.new(secret.encode(), h + b"." + p, hashlib.sha256).digest())).decode()
open("/tmp/e2e_service_jwt", "w").write(jwt("service_role")); open("/tmp/e2e_anon_jwt", "w").write(jwt("anon"))
print("lab tokens refreshed (valid 24 hours)")
PY
