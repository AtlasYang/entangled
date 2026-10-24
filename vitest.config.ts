import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const src = (pkg: string) => here(`./packages/${pkg}/src/index.ts`);

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    // Test against sources so packages don't need building first.
    alias: {
      "@entangled-ui/core/auto": here("./packages/core/src/auto.ts"),
      "@entangled-ui/core": src("core"),
      "@entangled-ui/presets": src("presets"),
      "@entangled-ui/react": src("react"),
      "@entangled-ui/devtools/always": src("devtools"),
      "@entangled-ui/devtools": src("devtools"),
      "@/lib/utils": here("./registry/lib/utils.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["packages/*/test/**/*.test.{ts,tsx}", "registry/test/**/*.test.{ts,tsx}"] },
      },
      {
        // Same React suite against React 18. react-dom@18 in tests/react18
        // resolves its own react@18 peer; sources are aliased to match.
        extends: true,
        resolve: {
          alias: {
            react: here("./tests/react18/node_modules/react"),
            "react-dom": here("./tests/react18/node_modules/react-dom"),
          },
        },
        test: { name: "react18", include: ["packages/react/test/**/*.test.{ts,tsx}"] },
      },
    ],
  },
});
