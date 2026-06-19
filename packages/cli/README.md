# @adobe-addon-i18n/cli

A local AST compiler that parses your React source files, extracts every `t()` call, and non-destructively syncs the discovered keys into your locale JSON files. Includes a built-in translation engine powered by the Google Translate API.

Runs entirely on your machine during development — it is never part of the browser bundle.

---

## Installation

```bash
npm install --save-dev @adobe-addon-i18n/cli
```

---

## Commands

### `sync`

Scans your source directory for `t()` calls (in files that import `useTranslation`) and appends any new keys into your locale JSON files as empty strings. Existing translations are **never overwritten**.

```bash
npx adobe-addon-i18n sync --src ./src --locales ./locales --langs en,fr,de
```

| Flag | Default | Description |
|---|---|---|
| `--src <path>` | `./src` | Source directory to scan for `t()` calls |
| `--locales <path>` | `./locales` | Directory where locale JSON files are written |
| `--langs <list>` | `en` | Comma-separated BCP 47 language tags (e.g. `en,fr,zh-Hant`) |

**Language code validation:** All values passed to `--langs` are validated against the BCP 47 format. Invalid codes (e.g. path traversal sequences) are rejected before any files are touched.

**Dynamic keys:** Only static string literals are extracted (e.g. `t('my.key')`). Template literals, function calls, or ternaries used as the key argument (e.g. `` t(`dynamic.${part}`) ``) cannot be statically analysed and will generate a warning. Add those keys to your JSON files manually.

---

### `translate`

Scans your locale directory for empty-string values (`""`), uses the source language file as the reference, and fills in translations via the Google Translate API.

```bash
npx adobe-addon-i18n translate --src en --locales ./locales
```

| Flag | Default | Description |
|---|---|---|
| `--src <lang>` | `en` | Source language to translate from (BCP 47 tag) |
| `--locales <path>` | `./locales` | Directory containing your locale JSON files |
| `--no-translate` | — | Skip all API calls (see Privacy section below) |
| `--concurrency <n>` | `5` | Max number of parallel translation requests |

---

## ⚠️ Privacy & Terms of Service Notice

The `translate` command uses the **unofficial** Google Translate scraper endpoint (`client=gtx`). This endpoint is **not part of Google's public API**, has no SLA, and its use may conflict with Google's Terms of Service.

**Your translation key strings are sent to Google's servers in plain text.** This includes any UI copy, error messages, or labels in your application. Do not use the `translate` command if:

- Your strings contain personally identifiable information (PII).
- Your organisation has data-residency or GDPR obligations.
- Your CI environment is air-gapped or has restricted outbound network access.

Use the `--no-translate` flag to suppress all network calls:

```bash
npx adobe-addon-i18n translate --src en --locales ./locales --no-translate
```

---

## Security

- **Prototype pollution protection:** Key paths containing `__proto__`, `constructor`, or `prototype` segments are rejected with an error.
- **Path traversal protection:** Language codes from `--langs` are validated against a strict BCP 47 regex. Constructed file paths are verified to stay within the locales directory before any reads or writes occur.
- **JSON schema validation:** Locale files that do not contain a plain JSON object (e.g. arrays, bare strings) are rejected with a descriptive error instead of silently corrupting the merge.

---

## `tsconfig.json` Awareness

The `sync` command automatically looks for a `tsconfig.json` in your current working directory and passes it to the TypeScript compiler. This ensures that path aliases and custom compiler settings from your project are respected during AST parsing.

---

## License

MIT
