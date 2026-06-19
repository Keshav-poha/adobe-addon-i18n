import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A translation value is either a plain string or a nested dictionary.
 * Using a proper recursive type (instead of `any`) means the TypeScript
 * compiler will catch attempts to pass non-object locale files.
 */
export type TranslationValue = string | TranslationDict;
export type TranslationDict = { [key: string]: TranslationValue };

/**
 * Safe interpolation parameter values — only types where String() coercion
 * is safe and intentional. Prevents accidentally passing Promises or objects.
 */
export type InterpolationParams = Record<string, string | number | boolean>;

export interface I18nContextType {
  /** The currently active BCP 47 locale string (e.g. "en", "fr", "zh-Hant"). */
  locale: string;
  /**
   * Translates `key` using the active locale dictionary.
   *
   * - Supports dot-notation for nested keys: `t('auth.login.title')`
   * - Supports variable interpolation: `t('greeting', { name: 'Keshav' })`
   * - Supports simple pluralization via a `count` param:
   *     `t('item_count', { count: 3 })` → uses `item_count_plural` when count ≠ 1
   * - Falls back to `defaultLocale` when the active locale is missing a key.
   * - Returns the raw key string when no dictionary entry is found.
   *
   * @param key  Dot-notation translation key.
   * @param params  Optional interpolation parameters.
   */
  t: (key: string, params?: InterpolationParams) => string;
}

// ---------------------------------------------------------------------------
// Internal Adobe Add-on SDK type (narrow, non-`any` interface)
// ---------------------------------------------------------------------------

interface AddOnUISdkLocaleEvent {
  locale: string;
}

interface AddOnUISdkApp {
  ui: { locale: string };
  on(event: 'localechange', handler: (data: AddOnUISdkLocaleEvent) => void): void;
  off(event: 'localechange', handler: (data: AddOnUISdkLocaleEvent) => void): void;
}

interface AddOnUISdk {
  ready: Promise<void>;
  app: AddOnUISdkApp;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const I18nContext = createContext<I18nContextType | null>(null);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveValue(obj: TranslationDict, pathString: string): TranslationValue | undefined {
  const keys = pathString.split('.');
  let current: TranslationValue = obj;

  for (const key of keys) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as TranslationDict)[key];
  }

  return current;
}

/**
 * Replaces `{{key}}` placeholders in `template` with values from `params`.
 * If a placeholder key is not present in `params`, the original `{{key}}`
 * token is preserved (no silent data loss).
 *
 * ⚠️  Security note: The returned string is a plain string and is safe to
 * render via React's default text-node rendering. If you pass this result to
 * `dangerouslySetInnerHTML`, you are responsible for sanitizing it first, as
 * param values are not HTML-escaped by this library.
 */
function interpolate(template: string, params: InterpolationParams): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_, g1: string) => {
    const key = g1.trim();
    return key in params ? String(params[key]) : `{{${key}}}`;
  });
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface I18nProviderProps {
  /** Map of BCP 47 locale codes to their translation dictionaries. */
  locales: Record<string, TranslationDict>;
  /** Locale to use when the SDK locale is not available or not in `locales`. */
  defaultLocale: string;
  children: React.ReactNode;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ locales, defaultLocale, children }) => {
  const [currentLocale, setCurrentLocale] = useState(defaultLocale);

  const resolveLocale = useCallback(
    (candidate: string): string => {
      if (locales[candidate]) return candidate;
      // BCP 47 fallback: "en-US" → "en"
      const primary = candidate.split('-')[0];
      if (locales[primary]) return primary;
      return defaultLocale;
    },
    [locales, defaultLocale]
  );

  useEffect(() => {
    // Handler reference is stable within this effect so we can clean it up.
    const handleLocaleChange = (data: AddOnUISdkLocaleEvent): void => {
      setCurrentLocale(resolveLocale(data.locale));
    };

    let sdk: AddOnUISdkApp | null = null;

    const tryInitSdk = async (): Promise<void> => {
      try {
        if (typeof window === 'undefined' || !(window as unknown as { addOnUISdk?: AddOnUISdk }).addOnUISdk) {
          return;
        }

        const rawSdk = (window as unknown as { addOnUISdk: AddOnUISdk }).addOnUISdk;
        await rawSdk.ready;

        sdk = rawSdk.app;

        // Set the initial locale from the SDK.
        if (sdk.ui?.locale) {
          setCurrentLocale(resolveLocale(sdk.ui.locale));
        }

        // Subscribe to future locale changes.
        sdk.on('localechange', handleLocaleChange);
      } catch (e) {
        console.warn('[adobe-addon-i18n] Failed to initialize AddOnSdk locale detection', e);
      }
    };

    tryInitSdk();

    // Cleanup: unregister the listener when the component unmounts or deps change.
    // This prevents stale-closure handler accumulation on the SDK event bus.
    return () => {
      if (sdk) {
        sdk.off('localechange', handleLocaleChange);
      }
    };
  }, [locales, defaultLocale, resolveLocale]);

  const t = useMemo(() => {
    return (key: string, params?: InterpolationParams): string => {
      const dictionary = locales[currentLocale] ?? locales[defaultLocale];
      if (!dictionary) return key;

      // Pluralization: when `params.count` is provided and is not 1,
      // look for a `<key>_plural` variant first before falling back to the base key.
      const pluralKey =
        params !== undefined && typeof params.count === 'number' && params.count !== 1
          ? `${key}_plural`
          : null;

      const value =
        (pluralKey !== null ? resolveValue(dictionary, pluralKey) : undefined) ??
        resolveValue(dictionary, key);

      if (typeof value !== 'string') return key;

      return params ? interpolate(value, params) : value;
    };
  }, [currentLocale, locales, defaultLocale]);

  return <I18nContext.Provider value={{ locale: currentLocale, t }}>{children}</I18nContext.Provider>;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTranslation(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error(
      '[adobe-addon-i18n] useTranslation() must be called inside an <I18nProvider>.'
    );
  }
  return context;
}
