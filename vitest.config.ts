import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Increase timeout for database operations
    testTimeout: 30000,
    coverage: {
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
    // Custom reporters for SQL-on-FHIR test report generation
    reporters: ["default", "src/tests/utils/reporter"],
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      // Handle .js extensions in TypeScript imports
      "@": "/src",
    },
  },
});
