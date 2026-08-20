<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# `main` is Production — pushing/merging into it deploys the live site

**`main` is connected to Vercel Production via GitHub integration.** A push or
merge into `main` — from any source, including a fast-forward merge from a
feature branch — triggers an automatic Production deployment. This is not
theoretical: on 2026-08-20, merging an approved, Staging-verified feature
branch into `main` and pushing it auto-deployed to `ordiftstudios.com` within
seconds, despite no deployment having been separately requested or approved.
The GitHub→Vercel integration was previously observed as *unreliable*
(TD-047, a deployment miss) — it is evidently reconnected and working again,
so treat it as live and armed, not as broken.

**Rule, effective immediately:** treat every push or merge into `main` as a
Production deployment action. Do not push or merge into `main` unless the
user has explicitly authorized a Production deployment in that specific
message — prior approval of the underlying code/feature work is not the same
thing as approval to deploy it. Do the actual code/test/verification work on
a feature branch, verify against Staging, and stop there for explicit,
separate deployment approval before ever touching `main`.

This applies regardless of the mechanism — `git push`, a fast-forward merge,
a merge commit, or a GitHub PR merge — all reach `main` and all trigger the
same automatic deployment.
