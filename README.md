# adobe-addon-i18n

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/Keshav-poha/adobe-addon-i18n/actions/workflows/ci.yml/badge.svg)](https://github.com/Keshav-poha/adobe-addon-i18n/actions)

A zero-dependency, React-first localization infrastructure designed exclusively for the **Adobe Express ecosystem**.

## Architecture

This monorepo solves the iframe bundle size problem by splitting into two distinct workspaces:

1. **`@adobe-addon-i18n/core`**: A microscopic React runtime hooking directly into the Adobe Add-on SDK.
2. **`@adobe-addon-i18n/cli`**: A static AST analysis daemon that extracts your translation keys.

## Quick Start

```sh
npm install @adobe-addon-i18n/core
npm install --save-dev @adobe-addon-i18n/cli
```

### Usage

Run the CLI to automatically detect keys and sync them into your `locales` folder.

```sh
npx adobe-addon-i18n sync
```

You can then use the translation engine to automatically translate missing keys via Google Translate API for free:

```sh
npx adobe-addon-i18n translate --src en --locales ./locales
```
