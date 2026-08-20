<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Error-prevention protocol (effective 2026-08-21)

Adopted after two real incidents in one session: a `supabase db dump --dry-run`
call printed the Staging database password in plaintext into a chat
transcript, and a shell-history redaction attempt was incomplete and
re-exposed a fragment of an already-rotated Production password. Classify
every proposed action before executing it.

**GREEN — execute normally, no need to ask.** Reading source files, running
established local tests, typechecking, linting, reviewing diffs, searching
non-sensitive docs — genuinely read-only development work.

**AMBER — verify first, execute only within existing authorization.** Staging
state changes, database inspection, deployment/backup verification, branch
operations, non-Production migrations — anything whose side effects depend on
environment or flags. Before executing, confirm: exact environment, exact
command, expected side effects, whether credentials could appear in output,
the rollback/recovery method, and that this specific action is already
authorized. If any of those is uncertain, stop rather than experiment.

**RED — explicit authorization required every time, never implied by a prior
approval.** Writing to Production, deploying Production, applying Production
migrations, merging into `main` (main deploys to Production automatically —
see the deploy-rule note this section supersedes/extends), deleting
Production data, changing auth/security config, rotating credentials,
accessing secret values, destructive Git/filesystem operations, restoring a
database, changing payment configuration, or any other irreversible/high-impact
external action.

## Absolute secret rule

Never display or retrieve a secret value merely to confirm it exists. Never
print database passwords, API secret keys, tokens, connection strings
containing credentials, private keys, or protected env-var values into any
output. Never use `--dry-run`, shell history, debug output, env dumping,
`echo`/`cat`/`grep`, or any other exploratory mechanism if it could expose a
secret — test redaction logic before trusting it, or don't run the command at
all. Presence, variable name, environment scope, and other non-secret
metadata may be checked freely. If a task genuinely needs a secret, make it a
human-only step with the established hidden-prompt/secure-interface method —
never ask the human to paste a credential into chat.

## No experimenting on project infrastructure

Never run a command against Local, Staging, or Production just to see how its
flags/output behave, when `--help`, source inspection, or existing project
documentation can answer the question safely instead.

## Target confirmation

Before any database/Supabase/Vercel/Git-deployment/infrastructure command,
independently confirm which environment/project/branch is targeted — never
infer it from what the previous command happened to target. Return tooling
to the safe Staging/default state immediately after any temporary Production
access, and verify that fact.

## Destructive-action rule

Before deleting, resetting, overwriting, cleaning, force-pushing, dropping,
restoring, recursively removing, or replacing anything: establish exactly
what's affected, why it's necessary, the recovery/rollback path, obtain
AMBER/RED authorization as required, then execute only the minimum-scoped
operation. Never broaden a command because it's easier.

## When something unexpected happens

Stop the affected operation. Preserve current state. Do not immediately
attempt a repair. Determine what actually changed using safe/read-only
evidence. Report facts, impact, and a proposed recovery. Wait for
authorization where required. Do not compound one mistake with speculative
remediation.
