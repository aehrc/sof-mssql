const eslint = require("@eslint/js");
const tseslint = require("@typescript-eslint/eslint-plugin");
const tsparser = require("@typescript-eslint/parser");

module.exports = [
  // Base ESLint recommended rules
  eslint.configs.recommended,

  // TypeScript configuration
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tsconfig.json",
      },
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        global: "writable",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      // TypeScript-specific rules for medical/healthcare code
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "error",

      // Naming conventions (Australian English preference)
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "default",
          format: ["camelCase"],
          leadingUnderscore: "allow",
          trailingUnderscore: "forbid",
        },
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE"],
        },
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
        {
          selector: "enumMember",
          format: ["PascalCase"],
        },
      ],

      // Code quality and safety rules for healthcare data
      complexity: ["error", 10],
      "max-depth": ["error", 4],
      "max-lines-per-function": ["error", 50],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always"],

      // Import and module rules
      "no-duplicate-imports": "error",
      "sort-imports": [
        "error",
        {
          ignoreCase: true,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ["none", "all", "multiple", "single"],
        },
      ],

      // Error handling - critical for medical data processing
      "no-throw-literal": "error",

      // Disable rules that conflict with Prettier
      indent: "off",
      quotes: "off",
      semi: "off",
      "comma-dangle": "off",
      "max-len": "off",
    },
  },

  // Test files configuration
  {
    files: ["src/**/*.test.ts"],
    rules: {
      // Relax some rules for test files
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "max-lines-per-function": "off",
      "no-console": "off",
      complexity: "off",
    },
  },

  // Test utilities configuration
  {
    files: ["src/tests/utils/**/*.ts"],
    rules: {
      // Allow console output in test utilities for debugging
      "no-console": "off",
    },
  },

  // Ignore patterns
  {
    ignores: [
      "dist/**/*",
      "out/**/*",
      "node_modules/**/*",
      "coverage/**/*",
      "src/generated/**/*", // Generated ANTLR grammar files
      "sqlonfhir/**/*", // SQL on FHIR test data
      "*.d.ts",
      "*.config.js",
      "*.config.ts",
    ],
  },
];
