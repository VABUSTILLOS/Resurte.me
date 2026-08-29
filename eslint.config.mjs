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
    ignores: ["node_modules/**", ".next/**", ".vercel/**", "out/**", "build/**", "next-env.d.ts", "scripts/archive/**"],
  },
];

export default eslintConfig;