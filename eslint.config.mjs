import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react/no-unescaped-entities": "off",
      "@next/next/no-html-link-for-pages": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    files: ["*.config.{ts,js,mjs,cjs}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Tests: el non-null assertion es idiomático en asserts sobre mocks
    // (mock.calls[0]![0]) y un falso positivo haría fallar el test de todos
    // modos; no aporta señal mantenerlo como warning aquí.
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // `.next*/**` y no `.next/**`: el e2e le da a su servidor un `distDir` propio
    // (`NEXT_DIST_DIR` en next.config.ts) para no chocar con el `next dev` del
    // desarrollador, y ese caché no es código: sin este glob, ESLint lo lintea y
    // `npm run verify` pasa de verde a ~24.000 problemas según corras o no el e2e.
    ignores: ["node_modules/**", ".next*/**", ".vercel/**", "out/**", "build/**", "next-env.d.ts", "scripts/archive/**", "test-results/**", "playwright-report/**", "blob-report/**"],
  },
];

export default eslintConfig;