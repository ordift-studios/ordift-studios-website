import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// LOCAL-DATABASE end-to-end tier for Creative Crew Support. It runs the REAL
// server code against a throwaway Postgres + PostgREST built from the full
// migration chain on this machine (see scripts/crew-support-e2e.md). It
// deliberately does NOT load .env.local, so it can never reach Staging or
// Production credentials; the test itself also refuses any non-localhost
// Supabase URL. Outbound email is mocked and captured, never sent.
const read = (p: string) => { try { return readFileSync(p, "utf8").trim(); } catch { return ""; } };

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.localdb.e2e.ts"],
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54998",
      SUPABASE_SECRET_KEY: read("/tmp/e2e_service_jwt"),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: read("/tmp/e2e_anon_jwt"),
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      SITE_ENV: "staging",
    },
  },
});
