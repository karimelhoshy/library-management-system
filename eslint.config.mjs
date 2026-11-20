import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const DB_MESSAGE = "Pages and components don't query the database. Call a service in src/server/services instead.";
const NO_UI = {
  group: ["@/components", "@/components/**", "@/app/**"],
  message: "Server code never imports UI. Put shared types and helpers in src/lib.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
  // Layer boundaries (README › Architecture). Each block lists everything that folder may not import.
  {
    files: ["src/app/**", "src/components/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/server/db", "@/server/db/**", "drizzle-orm", "drizzle-orm/**"], allowTypeImports: true, message: DB_MESSAGE }] },
      ],
    },
  },
  {
    files: ["src/server/**"],
    ignores: ["src/server/services/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", { patterns: [NO_UI] }],
    },
  },
  {
    files: ["src/server/services/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            NO_UI,
            {
              group: ["next", "next/**", "@/server/actions", "@/server/actions/**"],
              message: "Services stay framework-free so server actions, AI tools, scripts and tests can all call them.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server", "@/server/**", "@/components", "@/components/**", "@/app/**"],
              message: "src/lib is shared by the browser and the server, so it can't depend on either.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
