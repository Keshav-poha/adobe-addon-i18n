# i18n-express: Comprehensive Project Roadmap & Tasks

## Project Context

`i18n-express` is a zero-dependency, React-first localization infrastructure designed exclusively for the Adobe Express ecosystem. It solves the iframe bundle size problem by splitting into two workspaces:

1. **`@i18n-express/core`**: A microscopic React runtime hooking into the Adobe Add-on SDK for locale detection, handling regex-based interpolation, and deep dot-notation resolution.
2. **`@i18n-express/cli`**: A local AST compiler serving as a static analysis daemon to parse React source files, extract keys, and safely merge them into nested JSON dictionaries.
3. **The Translation Engine**: An LLM-powered utility built into the CLI to automatically provide context-aware translations.

---

## 🟢 Phase 1: Core Foundation (COMPLETED)

- `[x]` **Purge Backend Patterns**: Ensure no Node.js runtime modules (`fs`, `path`) or Express types are present in the core package.
- `[x]` **React Hook & Context**: Export `I18nProvider` and `useTranslation`.
- `[x]` **SDK Locale Detection**: Hook into Adobe Express Add-on SDK (`addOnUISdk.app.ui.locale`) and `localechange` events.
- `[x]` **Add-on SDK Strict Typings**: Replace `any` with strict interface structures.
- `[x]` **Regex Interpolation**: Safely inject dynamic variables (e.g., `{{username}}`).
- `[x]` **Dot-Notation Resolution**: Traverse nested JSON objects at runtime using string keys.

---

## 🟢 Phase 2: AST Compiler Improvements (COMPLETED)

- `[x]` **Async File Operations**: Transition the CLI entirely to `node:fs/promises`.
- `[x]` **Verified AST Parsing**: Refactor `ts-morph` to actively verify that `useTranslation` is imported before extracting `t()` calls.
- `[x]` **Deep JSON Merging**: Expand flat dot-notation keys into nested JSON objects (`errors.auth.invalid` -> `{"errors": {"auth": {"invalid": ""}}}`).
- `[x]` **Data Loss Protection**: Throw warnings and prevent silent overwriting of strings by nested objects.
- `[x]` **Non-Destructive Sync**: Append only new keys with empty strings (`""`), maintaining the integrity of existing translations.

---

## 🟢 Phase 3: The Translation Engine (COMPLETED)

Automating the translation of empty keys using a free, zero-dependency API pipeline.

- `[x]` **Setup Translation API**:
  - Utilize the free, unauthenticated Google Translate API (`translate.googleapis.com`) using native Node.js `fetch`.
  - Avoid heavy dependencies like `@google/genai` or `dotenv`.
- `[x]` **`translate` Command Scaffold**:
  - Create `cli.command('translate')` in `cli.ts`.
  - Add flags: `--src <lang>` (default: `en`), `--locales <dir>` (default: `./locales`).
- `[x]` **Missing Key Targeting Algorithm**:
  - Load the source JSON (`en.json`) and target JSONs (`es.json`, etc.).
  - Recursively diff objects to isolate paths where the target value is exactly `""`.
- `[x]` **Safe Translation & Interpolation Protection**:
  - Tokenize dynamic variables (`{{variable}}` -> `__0__`) before sending to the translation API.
  - Fetch translations and restore tokens back to `{{variable}}` to prevent interpolation breakage.
- `[x]` **JSON Reintegration**:
  - Inject translated strings back into the deep JSON structure using the `setDeep` utility.
  - Write back to disk using `fs/promises`.

---

## 🟢 Phase 4: Open Source Standards & Documentation (COMPLETED)

Transforming the codebase into a mature, welcoming, and standardized open-source repository.

- `[x]` **License Initialization**:
  - Create an OSI-approved `LICENSE` file at the repository root (e.g., MIT or Apache 2.0).
- `[x]` **Root README.md**:
  - Add a high-quality root `README.md` featuring a project banner.
  - Add badges (npm version, build status, license).
  - Provide a high-level architectural diagram or explanation of the dual-workspace setup.
  - Add an overarching "Quick Start" guide.
- `[x]` **Package-level READMEs**:
  - Create `packages/react/README.md` detailing `<I18nProvider>`, `useTranslation()`, and interpolation syntax.
  - Create `packages/cli/README.md` documenting the `sync` and `translate` commands and their flags.
- `[x]` **Community Guidelines**:
  - Create `CONTRIBUTING.md` detailing how to install dependencies (`npm install`), build the monorepo, and submit pull requests.
  - Create `CODE_OF_CONDUCT.md` using the Contributor Covenant template.
- `[x]` **GitHub Issue/PR Templates**:
  - Create `.github/ISSUE_TEMPLATE/bug_report.md` (Expected behavior, actual behavior, reproduction steps).
  - Create `.github/ISSUE_TEMPLATE/feature_request.md` (Motivation, proposed solution).
  - Create `.github/pull_request_template.md` (Changes made, issue links, checklist).

---

## 🟢 Phase 5: Code Quality Gates & Formatting (COMPLETED)

Enforcing code cleanliness locally before code is ever pushed.

- `[x]` **Prettier Integration**:
  - Install `prettier` at the workspace root.
  - Create `.prettierrc` (e.g., `semi: true`, `singleQuote: true`, `printWidth: 100`).
  - Add `.prettierignore` for build outputs and node_modules.
  - Run `npx prettier --write .` across the entire repo.
- `[x]` **ESLint Setup**:
  - Install `eslint`, `@typescript-eslint/parser`, and `@typescript-eslint/eslint-plugin`.
  - Create `eslint.config.js` or `.eslintrc.js` with rules targeting unused variables, explicit return types, and React hooks linting (`eslint-plugin-react-hooks`).
- `[x]` **Pre-commit Hooks (Husky + Lint-Staged)**:
  - Install `lint-staged`.
  - Configure `.husky/pre-commit` to execute `npx lint-staged`.
  - In `package.json`, configure `lint-staged` to run Prettier and ESLint specifically on staged `*.ts` and `*.tsx` files.
- `[x]` **Type Checking Script**:
  - Add `"typecheck": "tsc --noEmit --project packages/react/tsconfig.json && tsc --noEmit --project packages/cli/tsconfig.json"` to the root `package.json`.

---

## 🟢 Phase 6: Testing & Reliability (COMPLETED)

Guaranteeing the engine won't break production applications.

- `[x]` **Unit Test Framework Setup**:
  - Install `vitest` and `@testing-library/react` (for the core React package) at the root.
  - Create `vitest.config.ts` supporting monorepo workspaces.
- `[x]` **Core Runtime Tests (`packages/react/src/__tests__`)**:
  - `index.test.tsx`: Test `<I18nProvider>` mounting and `useTranslation` context retrieval.
  - Test deep dot-notation resolution (e.g., `t("deep.nested.key") === "value"`).
  - Test interpolation fallback logic (missing variables remain `{{variable}}`).
  - Mock `window.addOnUISdk` to verify locale fallback chains (e.g., `es-ES` falling back to `es` or default).
- `[x]` **CLI Compiler Tests (`packages/cli/src/__tests__`)**:
  - Mock `ts-morph` to test extraction accuracy against dummy React files.
  - Create unit tests for the `setDeep`, `hasDeep`, and `countEmptyDeep` object utilities to ensure no data loss occurs during sync.
- `[x]` **AI Pipeline Mocking**:
  - Mock the `@google/genai` client response to test that the `translate` command correctly injects generated strings back into the JSON tree.
- `[x]` **Code Coverage**:
  - Configure Vitest coverage (e.g., using `@vitest/coverage-v8`).
  - Target >80% coverage across both packages.

---

## 🟢 Phase 7: Build Systems & Automated Publishing (CI/CD) (COMPLETED)

Preparing the packages for the NPM registry with automated GitHub Actions.

- `[x]` **Build Pipeline Setup**:
  - Install `tsup` in both packages for zero-config bundling.
  - Configure `tsup.config.ts` to output `cjs` and `esm` formats alongside `.d.ts` declaration files.
  - Update `package.json` `exports`, `main`, `module`, and `types` fields appropriately for NPM publishing.
- `[x]` **Changesets Integration**:
  - Install `@changesets/cli`.
  - Initialize changesets (`npx changeset init`).
  - Add scripts: `"changeset": "changeset"`, `"version": "changeset version"`.
- `[x]` **GitHub Action: PR Verification Workflow (`.github/workflows/ci.yml`)**:
  - Trigger on Pull Requests.
  - Steps: `npm ci`, run `npm run lint`, run `npm run typecheck`, run `npm run test` (including coverage threshold enforcement).
- `[x]` **GitHub Action: Automated Release Workflow (`.github/workflows/release.yml`)**:
  - Trigger on merge to `main`.
  - Use `changesets/action` to automatically open "Version Packages" PRs or publish directly to NPM and generate GitHub Releases when the PR is merged.
