import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';

declare global {
  var addOnUISdk: {
    ready: Promise<void>;
    app: {
      ui: {
        locale: string;
      };
      on: (event: 'localechange' | string, callback: (data: { locale: string }) => void) => void;
    };
  };
}

export interface I18nContextType {
  locale: string;
  t: (key: string, params?: Record<string, any>) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

function resolveValue(obj: any, pathString: string): any {
  const keys = pathString.split('.');
  let current = obj;
  for (const key of keys) {
    if (current === undefined || current === null) return undefined;
    current = current[key];
  }
  return current;
}

function interpolate(template: string, params: Record<string, any>): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_, g1) => {
    const key = g1.trim();
    return params[key] !== undefined ? String(params[key]) : `{{${key}}}`;
  });
}

export interface I18nProviderProps {
  locales: Record<string, Record<string, any>>;
  defaultLocale: string;
  children: React.ReactNode;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ locales, defaultLocale, children }) => {
  const [currentLocale, setCurrentLocale] = useState(defaultLocale);

  useEffect(() => {
    const tryInitSdk = async () => {
      try {
        if (typeof window !== 'undefined' && window.addOnUISdk) {
          const sdk = window.addOnUISdk;
          await sdk.ready;
          
          if (sdk.app?.ui?.locale) {
            const detectedLocale = sdk.app.ui.locale;
            const primaryLang = detectedLocale.split('-')[0];
            
            if (locales[detectedLocale]) {
              setCurrentLocale(detectedLocale);
            } else if (locales[primaryLang]) {
              setCurrentLocale(primaryLang);
            }
          }

          sdk.app.on('localechange', (data: { locale: string }) => {
            const newLocale = data.locale;
            const primaryLang = newLocale.split('-')[0];
            if (locales[newLocale]) {
              setCurrentLocale(newLocale);
            } else if (locales[primaryLang]) {
              setCurrentLocale(primaryLang);
            } else {
              setCurrentLocale(defaultLocale);
            }
          });
        }
      } catch (e) {
        console.warn('[adobe-addon-i18n] Failed to initialize AddOnSdk locale detection', e);
      }
    };

    tryInitSdk();
  }, [locales, defaultLocale]);

  const t = useMemo(() => {
    return (key: string, params?: Record<string, any>): string => {
      const dictionary = locales[currentLocale] || locales[defaultLocale];
      if (!dictionary) return key;

      const value = resolveValue(dictionary, key);
      if (typeof value !== 'string') return key;

      if (params) {
        return interpolate(value, params);
      }
      return value;
    };
  }, [currentLocale, locales, defaultLocale]);

  return (
    <I18nContext.Provider value={{ locale: currentLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
}
