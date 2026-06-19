<div align="center">
  <h1>🌍 i18n-express</h1>
  <p><strong>A zero-dependency, React-first localization infrastructure built exclusively for the Adobe Express ecosystem.</strong></p>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/Keshav-poha/adobe-addon-i18n/actions/workflows/ci.yml/badge.svg)](https://github.com/Keshav-poha/adobe-addon-i18n/actions)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

</div>

<hr />

## 🤔 Why did we make this?

Building Add-ons for Adobe Express comes with a unique challenge: **Iframe Bundle Size constraints.**

Traditional i18n libraries (like `i18next` or `react-intl`) are fantastic, but they ship with massive parsers, pluralization engines, and ICU message formatters. When you are building a lightweight Add-on that needs to load instantly inside an Adobe Express iframe, every kilobyte matters.

**`i18n-express` solves this by physically splitting the localization process into two halves:**

1. **A Microscopic Runtime:** A tiny React context provider that only knows how to do three things: listen to the Adobe SDK for locale changes, resolve deep object keys (e.g., `user.auth.login`), and replace `{{variables}}`.
2. **A Heavyweight Local Daemon:** A CLI that runs _on your machine_, not in the browser. It parses your React code, extracts your keys, manages your JSON files, and even uses AI to translate them for you.

You get the developer experience of a massive enterprise i18n framework, but your end-users only download a microscopic React runtime.

---

## 🏗️ Architecture & How It Works

```mermaid
graph TD
    subgraph Browser - Adobe Express Iframe
        A[Your React Add-on] -->|uses| B[@adobe-addon-i18n/core]
        B -->|reads| C[locales/*.json]
        B -.->|listens to| D[Adobe Express addOnUISdk]
    end

    subgraph Your Local Development Machine
        E[@adobe-addon-i18n/cli] -->|1. Parses AST| A
        E -->|2. Syncs Keys| C
        E -->|3. Translates| F[Google Translate API]
        F -.->|Returns text| C
    end
```

### The Three Pillars

1. **`@adobe-addon-i18n/core`**: The React runtime. It automatically detects the user's language via the Adobe Express Add-on SDK (`addOnUISdk.app.ui.locale`) and listens for `localechange` events.
2. **`@adobe-addon-i18n/cli`**: The AST (Abstract Syntax Tree) compiler. Instead of you manually maintaining JSON files, the CLI reads your `.tsx` files, finds every time you called `t("my.key")`, and builds the JSON files for you automatically.
3. **The Translation Engine**: Built into the CLI, this engine scans your JSON files for empty strings (`""`), protects your `{{variables}}` using a tokenization algorithm, and fetches high-quality translations for free using the Google Translate API.

---

## 🚀 Getting Started (In Easy Language)

### 1. Installation

Install the tiny core package into your dependencies, and the heavy CLI into your dev dependencies.

```bash
npm install @adobe-addon-i18n/core
npm install --save-dev @adobe-addon-i18n/cli
```

### 2. Wrap your App

Wrap your root React component in the `<I18nProvider>`. This connects your app to the Adobe SDK.

```tsx
import { I18nProvider, useTranslation } from '@adobe-addon-i18n/core';

function App() {
  const { t } = useTranslation();

  return (
    <div>
      {/* Just invent keys as you type! No need to create them in JSON first. */}
      <h1>{t('onboarding.title')}</h1>

      {/* You can pass dynamic variables too */}
      <p>{t('onboarding.welcome', { username: 'Keshav' })}</p>
    </div>
  );
}

export default function Root() {
  return (
    <I18nProvider>
      <App />
    </I18nProvider>
  );
}
```

### 3. Sync your Keys (Magic Step 🪄)

You just wrote `t('onboarding.title')` in your code, but you haven't created any JSON files yet. That's fine! Run the sync command:

```bash
npx adobe-addon-i18n sync --src ./src --locales ./locales --langs en,es,fr,de
```

**What just happened?** The CLI read your React code, found your new keys, and automatically generated `en.json`, `es.json`, `fr.json`, and `de.json` with the following structure:

```json
{
  "onboarding": {
    "title": "",
    "welcome": ""
  }
}
```

### 4. Auto-Translate

Now you have empty JSON files in Spanish, French, and German. Fill out the English (`en.json`) file with your base text:

```json
{
  "onboarding": {
    "title": "Welcome to Adobe Express",
    "welcome": "Hello {{username}}, glad you are here!"
  }
}
```

Then, run the translate command:

```bash
npx adobe-addon-i18n translate --src en --locales ./locales
```

The Translation Engine will automatically detect that Spanish, French, and German are missing translations. It will query the free Google Translate API, safely protect your `{{username}}` variable so the AI doesn't break it, and fill out your JSON files instantly.

---

## 📖 CLI Commands Reference

### `sync`

Safely extracts keys from your source code and merges them into your locale JSON files without deleting existing translations.

| Flag        | Default     | Description                                          |
| ----------- | ----------- | ---------------------------------------------------- |
| `--src`     | `./src`     | Directory containing your React code                 |
| `--locales` | `./locales` | Directory where JSON files should be saved           |
| `--langs`   | `en,es,fr`  | Comma-separated list of target languages to generate |

### `translate`

Finds empty string values (`""`) in your target JSON files and auto-translates them based on the source file.

| Flag        | Default     | Description                           |
| ----------- | ----------- | ------------------------------------- |
| `--src`     | `en`        | The source language to translate from |
| `--locales` | `./locales` | Directory containing your JSON files  |

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) for details on how to get involved, submit pull requests, and set up the monorepo locally.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
