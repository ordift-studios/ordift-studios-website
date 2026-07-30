import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Unit-test layer only for now (Workstream A, increment 1): pure logic
// and Redis-fallback-backed modules that need no external service and
// no React rendering. jsdom + @testing-library/react + @vitejs/plugin-react
// are deliberately not installed yet — they currently conflict with this
// repo's bleeding-edge toolchain (@rolldown/plugin-babel vs. Sanity's
// pinned @babel/core, see TECHNICAL_DEBT_REGISTER.md) and component
// testing isn't the highest-priority gap. Revisit once that's resolved
// or a compatible React plugin version is confirmed.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
