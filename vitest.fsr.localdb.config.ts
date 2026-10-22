import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// LOCAL-ONLY end-to-end tier for the Founder self-review exception (ORDIFT-POL-FSR-001). It runs the REAL application
// code through supabase-js -> a throwaway PostgREST -> a throwaway PostgreSQL built from the full migration chain plus the
// PROPOSED migration 0169. It does not load .env.local, refuses any non-localhost URL, and uses synthetic JWT material
// minted for this run (E2E_FSR_DIR). Outbound email is mocked and captured, storage is stubbed.
const dir = process.env.E2E_FSR_DIR ?? "";
const read = (name: string) => { try { return readFileSync(`${dir}/${name}`, "utf8").trim(); } catch { return ""; } };

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/founderSelfReview*.localdb.e2e.ts"],
    testTimeout: 90000,
    hookTimeout: 180000,
    fileParallelism: false,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:55448",
      SUPABASE_SECRET_KEY: read("service_jwt"),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: read("anon_jwt"),
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      SITE_ENV: "staging",
    },
  },
});
