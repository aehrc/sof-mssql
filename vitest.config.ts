import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Increase timeout for database operations
    testTimeout: 30000,
    // Setup file for environment variables
    setupFiles: ['tests/setup/vitest-setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/cli.ts']
    },
    // Custom reporters for SQL-on-FHIR test report generation
    reporters: process.env.SQLONFHIR_REPORTER_PATH ? 
      ['default', process.env.SQLONFHIR_REPORTER_PATH] : 
      ['default']
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      // Handle .js extensions in TypeScript imports
      '@': '/src'
    }
  }
});