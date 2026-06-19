# @adobe-addon-i18n/cli

A local AST compiler serving as a static analysis daemon to parse React source files, extract keys, and safely merge them into nested JSON dictionaries. Includes a free Translation Engine.

## Commands

### `sync`

Sync AST and translation files non-destructively.

```sh
npx adobe-addon-i18n sync --src ./src --locales ./locales --langs en,es,fr
```

### `translate`

Automate translations via Google Translate.

```sh
npx adobe-addon-i18n translate --src en --locales ./locales
```
