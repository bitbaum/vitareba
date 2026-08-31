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
  // eslint-config-next ships `settings.react.version: 'detect'`; detection calls
  // context.getFilename(), removed in ESLint 10, and throws on every file. Pin the version.
  {
    settings: { react: { version: "19.2.8" } },
  },
  {
    // react-hooks v7 introduced aggressive React Compiler rules that flag
    // valid async data-loading patterns (useCallback + useEffect(() => { load(); }, [load]))
    // and pure server component code (Date.now() calls). Disabling until the
    // project adopts React Compiler and rewrites loaders to satisfy the rules.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
]);

export default eslintConfig;
