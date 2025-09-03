import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/cli.ts']
    }
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      // Handle .js extensions in TypeScript imports
      '@': '/src'
    }
  }
});