import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@benchlocal/core": path.resolve(rootDir, "packages/benchlocal-core/src/index.ts"),
      "@core": path.resolve(rootDir, "packages/benchlocal-core/src/index.ts"),
      "@benchpack-host": path.resolve(rootDir, "packages/benchpack-host/src/index.ts"),
      "@": path.resolve(rootDir, "app/src")
    }
  },
  test: {
    environment: "node",
    include: ["packages/**/test/**/*.test.{ts,tsx}", "app/**/test/**/*.test.{ts,tsx}"],
    exclude: ["**/dist/**", "**/out/**", "**/node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["**/dist/**", "**/out/**", "**/node_modules/**", "**/*.d.ts"]
    }
  }
});
