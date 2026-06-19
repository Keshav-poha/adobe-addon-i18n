# @adobe-addon-i18n/cli

## 0.2.0

### Minor Changes

- 5d76c2c: **Security & Architecture fixes (breaking for `any` users):**

  - fix(cli): prototype pollution guard in `setDeep` — rejects `__proto__`, `constructor`, `prototype` key segments
  - fix(cli): BCP 47 validation on `--langs` flag prevents path traversal attacks
  - fix(cli): `assertWithinDir` ensures all file writes stay within the locales directory
  - fix(cli): `JSON.parse` output validated as a plain object before processing (`assertTranslationDict`)
  - fix(react): `useEffect` now returns a cleanup function — deregisters `localechange` SDK listener on unmount

  **New features:**

  - feat(cli): `--no-translate` flag suppresses all Google Translate API calls
  - feat(cli): prints data privacy / ToS notice before making translation requests
  - feat(cli): `--concurrency <n>` flag for parallel translation requests (default: 5)
  - feat(cli): reads user's `tsconfig.json` for correct path alias resolution in ts-morph
  - feat(cli): warns when a non-literal `t()` argument is detected during sync
  - feat(react): basic pluralization via `<key>_plural` convention (`t('items', { count: 3 })`)
  - feat(react): `resolveLocale` extracted to `useCallback` for stable identity across renders

  **Type safety (potentially breaking if you used `any` in params):**

  - refactor(react): `InterpolationParams` now typed as `Record<string, string | number | boolean>` — passing objects or Promises is a compile error
  - refactor(react/cli): all `any` replaced with recursive `TranslationValue = string | TranslationDict`
  - refactor(react): `AddOnUISdk` typed as a proper interface instead of `window as any`

  **Bug fixes:**

  - fix(cli): `countEmptyDeep` no longer counts newly-added keys in the "pre-existing empty" metric
  - fix(cli): variable tokenization now uses Unicode PUA sentinels (`\uE000N\uE001`) instead of `__N__` — survives Google Translate mutation
