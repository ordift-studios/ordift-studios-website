import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Separate config from vitest.config.ts on purpose: this tier touches
// real (staging) infrastructure — see INTEGRATION_TESTING_STRATEGY.md —
// so it's kept structurally distinct from the dependency-free unit
// layer. `npm test` never runs these; `npm run test:integration` does,
// explicitly. setupFiles loads .env.local so real staging credentials
// are available via process.env the same way `next dev` provides them
// to the app itself.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["./vitest.integration.setup.ts"],
    // RLS/network round-trips are slower than in-memory unit tests —
    // real, not guessed, per INTEGRATION_TESTING_STRATEGY.md §9's
    // instruction to measure rather than estimate.
    testTimeout: 20000,
  },
});
