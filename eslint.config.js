import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist", "node_modules", "coverage"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.js"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // scripts/screenshot.mjs drives a browser and is deliberately not in
  // tsconfig.json — it is a documentation tool, not part of the game, and
  // nothing in src/ or test/ imports it. Type-checked rules need a project the
  // file is part of, so they are switched off for it rather than dragging it
  // into the build's type surface. The untyped rules still apply.
  {
    files: ["scripts/**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      // The project service is what fails to resolve this file, so it is turned
      // off here rather than the file being admitted to tsconfig.
      parserOptions: { project: false, projectService: false },
      globals: { console: "readonly", process: "readonly", URL: "readonly" },
    },
  },
);
