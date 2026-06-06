import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: {
      importSource: "react",
      runtime: "automatic",
    },
  },
  test: {
    environment: "node",
    exclude: ["**/.next/**", "**/coverage/**", "**/dist/**", "**/node_modules/**"],
    globals: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
