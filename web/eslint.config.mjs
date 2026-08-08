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
  ]),
  {
    // prisma/ holds standalone Node seed + admin scripts run through tsx. There
    // are no React components in there, so the React-specific rules only ever
    // fire as false positives - e.g. a plain helper named `useWord(concept)` in
    // seed-prompt-longform.ts, which the rules-of-hooks rule reads as a hook
    // called outside a component.
    files: ["prisma/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
]);

export default eslintConfig;
