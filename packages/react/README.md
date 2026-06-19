# @adobe-addon-i18n/react

The microscopic React runtime for `adobe-addon-i18n`.

Zero external dependencies. Integrates directly with the Adobe Express Add-on SDK to detect locale, listen for locale changes, and resolve translations from static JSON dictionaries.

---

## Installation

```bash
npm install @adobe-addon-i18n/react
```

---

## Quick Start

```tsx
import { I18nProvider, useTranslation } from '@adobe-addon-i18n/react';
import en from './locales/en.json';
import fr from './locales/fr.json';

const locales = { en, fr };

function App() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('header.title')}</h1>
      <p>{t('welcome.user', { username: 'Keshav' })}</p>
    </div>
  );
}

export default function Root() {
  return (
    <I18nProvider locales={locales} defaultLocale="en">
      <App />
    </I18nProvider>
  );
}
```

---

## API

### `<I18nProvider>`

| Prop | Type | Description |
|---|---|---|
| `locales` | `Record<string, TranslationDict>` | Map of BCP 47 locale codes to translation dictionaries |
| `defaultLocale` | `string` | Fallback locale when the SDK locale is not available |
| `children` | `React.ReactNode` | Your application tree |

The provider automatically:
1. Waits for `addOnUISdk.ready` to resolve.
2. Reads the initial locale from `addOnUISdk.app.ui.locale`.
3. Subscribes to `localechange` events for live updates.
4. Unregisters the `localechange` listener on unmount (no ghost handlers).

**Locale fallback chain:** If the SDK reports `"es-ES"` but your `locales` object only has `"es"`, the provider falls back to the primary language subtag automatically. If that is also absent, it uses `defaultLocale`.

### `useTranslation()`

Returns `{ locale: string, t: Function }`. Must be called inside an `<I18nProvider>`.

### `t(key, params?)`

| Argument | Type | Description |
|---|---|---|
| `key` | `string` | Dot-notation path into the translation dictionary (e.g. `"auth.login.title"`) |
| `params` | `Record<string, string \| number \| boolean>` | Optional interpolation variables |

**Returns:** The translated string, or the raw `key` if no entry is found.

---

## Features

### Dot-Notation Keys

```tsx
// Resolves locales.en.auth.login.title
t('auth.login.title')
```

### Variable Interpolation

```tsx
// en.json: { "greeting": "Hello, {{name}}!" }
t('greeting', { name: 'Keshav' })  // → "Hello, Keshav!"
```

If a variable is present in the template but absent from `params`, the original `{{placeholder}}` is preserved — there is no silent data loss.

### Pluralization

Use a `count` param to activate automatic plural form selection. Define a `<key>_plural` variant in your JSON for non-singular counts:

```json
{
  "item_count": "One item",
  "item_count_plural": "{{count}} items"
}
```

```tsx
t('item_count', { count: 1 })  // → "One item"
t('item_count', { count: 5 })  // → "5 items"
```

When `count !== 1`, the `_plural` variant is used. If no `_plural` variant exists, the base key is used as a fallback.

---

## TypeScript

The package exports proper recursive types for translation dictionaries:

```ts
import type { TranslationDict, TranslationValue, InterpolationParams } from '@adobe-addon-i18n/react';
```

- **`TranslationValue`** — `string | TranslationDict`
- **`TranslationDict`** — `{ [key: string]: TranslationValue }`
- **`InterpolationParams`** — `Record<string, string | number | boolean>`

---

## ⚠️ Security Note

The `t()` function returns a plain string. If you render the result via `dangerouslySetInnerHTML`, you are responsible for sanitizing it first — interpolated param values are not HTML-escaped by this library. For typical React usage (rendering as text nodes or JSX attributes), this is not a concern.

---

## License

MIT
