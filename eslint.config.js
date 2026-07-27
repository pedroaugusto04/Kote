import boundaries from "eslint-plugin-boundaries";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";
import globals from "globals";
import tseslint from "typescript-eslint";

const securityRules = Object.fromEntries(
  Object.keys(security.rules).map((ruleName) => [`security/${ruleName}`, "warn"]),
);

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "frontend/public/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      parser: tseslint.parser,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2024,
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      boundaries,
      security,
    },
    settings: {
      "boundaries/root-path": import.meta.dirname,
      "boundaries/elements": [
        { type: "backend-domain", pattern: "backend/src/domain/**/*", mode: "full" },
        { type: "backend-contracts", pattern: "backend/src/contracts/**/*", mode: "full" },
        { type: "backend-application", pattern: "backend/src/application/**/*", mode: "full" },
        { type: "backend-interfaces", pattern: "backend/src/interfaces/**/*", mode: "full" },
        { type: "backend-infrastructure", pattern: "backend/src/infrastructure/**/*", mode: "full" },
        { type: "backend-adapters", pattern: "backend/src/adapters/**/*", mode: "full" },
        { type: "backend-observability", pattern: "backend/src/observability/**/*", mode: "full" },
        { type: "backend-workers", pattern: "backend/src/workers/**/*", mode: "full" },
        { type: "frontend-app", pattern: "frontend/src/app/**/*", mode: "full" },
        { type: "frontend-pages", pattern: "frontend/src/pages/**/*", mode: "full" },
        { type: "frontend-layouts", pattern: "frontend/src/layouts/**/*", mode: "full" },
        { type: "frontend-widgets", pattern: "frontend/src/widgets/**/*", mode: "full" },
        { type: "frontend-features", pattern: "frontend/src/features/**/*", mode: "full" },
        { type: "frontend-shared", pattern: "frontend/src/shared/**/*", mode: "full" },
        { type: "cli", pattern: "cli/src/**/*", mode: "full" },
      ],
    },
    rules: {
      ...securityRules,
      "no-console": "off",
      "no-undef": "off",
      "no-empty": "warn",
      "no-useless-assignment": "warn",
      "prefer-const": "warn",
      "@typescript-eslint/consistent-type-imports": ["warn", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          rules: [
            {
              from: { type: "backend-domain" },
              disallow: [
                "backend-application",
                "backend-infrastructure",
                "backend-adapters",
                "backend-interfaces",
                "backend-workers",
              ],
            },
            {
              from: { type: "backend-contracts" },
              disallow: [
                "backend-application",
                "backend-infrastructure",
                "backend-adapters",
                "backend-interfaces",
                "backend-workers",
              ],
            },
            {
              from: { type: "backend-application" },
              disallow: [
                "backend-infrastructure",
                "backend-adapters",
                "backend-interfaces",
                "backend-workers",
              ],
            },
            {
              from: { type: "backend-interfaces" },
              disallow: [
                "backend-infrastructure",
                "backend-adapters",
                "backend-workers",
              ],
            },
            {
              from: { type: "backend-infrastructure" },
              disallow: ["backend-interfaces", "backend-workers"],
            },
            {
              from: { type: "backend-adapters" },
              disallow: ["backend-interfaces", "backend-workers"],
            },
            {
              from: { type: "frontend-shared" },
              disallow: [
                "frontend-app",
                "frontend-layouts",
                "frontend-pages",
                "frontend-widgets",
                "frontend-features",
              ],
            },
            {
              from: { type: "frontend-features" },
              disallow: ["frontend-pages"],
            },
            {
              from: { type: "frontend-widgets" },
              disallow: ["frontend-pages"],
            },
            {
              from: { type: "frontend-pages" },
              disallow: ["backend-domain", "backend-application", "backend-infrastructure"],
            },
            {
              from: { type: "cli" },
              disallow: [
                "backend-domain",
                "backend-application",
                "backend-infrastructure",
                "backend-interfaces",
                "frontend-app",
                "frontend-pages",
                "frontend-features",
                "frontend-widgets",
                "frontend-shared",
              ],
            },
          ],
        },
      ],
    },
  },
  {
    files: ["frontend/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
    },
    rules: {
      ...Object.fromEntries(
        Object.keys(reactHooks.configs.recommended.rules).map((ruleName) => [ruleName, "warn"]),
      ),
    },
  },
  {
    files: ["**/*.config.{ts,js}", "scripts/**/*.{ts,js}", "playwright.config.ts"],
    rules: {
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-child-process": "off",
    },
  },
);
