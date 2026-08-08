import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build output local de Vercel (`vercel build`/`vercel dev` genera CJS
    // launchers que no se lintan). Ignorado en git pero no en eslint.
    ".vercel/**",
  ]),
  {
    // Standalone Node scripts are CommonJS — require() is intentional there.
    files: ["scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Allow intentional `_`-prefixed unused args/vars (e.g. callback shapes).
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // The image optimizer is intentionally disabled (images.unoptimized: true),
    // so plain <img> elements are the correct, faster choice here.
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
