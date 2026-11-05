import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// "Live" checks: tests that talk to REAL external services (a non-Production Sanity dataset, a throwaway local Redis). They are deliberately outside both the unit glob (src/**/*.test.ts) and the
// staging integration glob (src/**/*.integration.test.ts), match only src/**/*.live.test.ts, and load NO environment file: whatever they need must be passed in explicitly by the person running
// them, so nothing runs by accident and no unrelated credentials are ever in scope. Each live test guards its own target and refuses anything that is not explicitly allowed.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { environment: "node", include: ["src/**/*.live.test.ts"], testTimeout: 60000, hookTimeout: 60000, fileParallelism: false },
});
