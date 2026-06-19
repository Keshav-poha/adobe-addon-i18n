# @adobe-addon-i18n/core

The microscopic React runtime for `adobe-addon-i18n`.

## Usage

Wrap your application in the `I18nProvider`.

```tsx
import { I18nProvider, useTranslation } from '@adobe-addon-i18n/core';

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
    <I18nProvider>
      <App />
    </I18nProvider>
  );
}
```
