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
    // Enable parallel test execution with thread pool
    pool: "threads",
    poolOptions: {
      threads: {
        // Use up to 16 concurrent threads (matches database connection pool max: 30)
        maxThreads: 16,
        minThreads: 4,
      },
    },
    // Note: sequence.concurrent cannot be used because globalSetup doesn't share
    // database connections with test workers. Each test file's beforeAll sets up
    // its own connection pool, and it.concurrent() provides test-level parallelism.
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      // Handle .js extensions in TypeScript imports
      "@": "/src",
    },
  },
});
