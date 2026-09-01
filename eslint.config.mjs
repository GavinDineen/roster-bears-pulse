import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [".next/**", "out/**", "build/**", "node_modules/**", "next-env.d.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Grandfathered: board.ts and editor.ts parse untyped third-party JSON
  // (weather.gov, ESPN, Gemini) with `any`. New code stays held to the strict
  // default — narrow this override away as those responses get real types.
  {
    files: ["lib/board.ts", "lib/editor.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "warn" },
  },
];

export default eslintConfig;
