import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { I18nProvider, useTranslation } from '../index';
import type { TranslationDict } from '../index';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const en: TranslationDict = {
  greeting: 'Hello, {{name}}!',
  deep: {
    nested: {
      key: 'Found it',
    },
  },
  items: 'One item',
  items_plural: '{{count}} items',
  only_in_en: 'English only',
};

const fr: TranslationDict = {
  greeting: 'Bonjour, {{name}}!',
  deep: {
    nested: {
      key: 'Trouvé',
    },
  },
  items: 'Un article',
  items_plural: '{{count}} articles',
};

const locales = { en, fr };

// ---------------------------------------------------------------------------
// Helper: a test component that renders translations
// ---------------------------------------------------------------------------

function TestComponent({ tKey, params }: { tKey: string; params?: Record<string, string | number | boolean> }): React.ReactElement {
  const { t } = useTranslation();
  return <span data-testid="output">{t(tKey, params)}</span>;
}

function Wrapper({
  children,
  defaultLocale = 'en',
  localeOverride,
}: {
  children: React.ReactNode;
  defaultLocale?: string;
  localeOverride?: Record<string, TranslationDict>;
}): React.ReactElement {
  return (
    <I18nProvider locales={localeOverride ?? locales} defaultLocale={defaultLocale}>
      {children}
    </I18nProvider>
  );
}

// ---------------------------------------------------------------------------
// I18nProvider — mounting
// ---------------------------------------------------------------------------

describe('I18nProvider', () => {
  it('mounts without crashing and provides context', () => {
    render(
      <Wrapper>
        <TestComponent tKey="greeting" params={{ name: 'World' }} />
      </Wrapper>
    );
    expect(screen.getByTestId('output').textContent).toBe('Hello, World!');
  });

  it('returns the raw key when a key is not found', () => {
    render(
      <Wrapper>
        <TestComponent tKey="totally.missing.key" />
      </Wrapper>
    );
    expect(screen.getByTestId('output').textContent).toBe('totally.missing.key');
  });

  it('returns the raw key when the entire dictionary is missing', () => {
    render(
      <Wrapper localeOverride={{ en: {} }} defaultLocale="de">
        <TestComponent tKey="greeting" />
      </Wrapper>
    );
    expect(screen.getByTestId('output').textContent).toBe('greeting');
  });
});

// ---------------------------------------------------------------------------
// Dot-notation resolution
// ---------------------------------------------------------------------------

describe('resolveValue / dot-notation', () => {
  it('resolves a three-level deep key', () => {
    render(
      <Wrapper>
        <TestComponent tKey="deep.nested.key" />
      </Wrapper>
    );
    expect(screen.getByTestId('output').textContent).toBe('Found it');
  });

  it('returns the key string when an intermediate node is missing', () => {
    render(
      <Wrapper>
        <TestComponent tKey="deep.missing.key" />
      </Wrapper>
    );
    expect(screen.getByTestId('output').textContent).toBe('deep.missing.key');
  });
});

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

describe('interpolate', () => {
  it('replaces a single {{variable}}', () => {
    render(
      <Wrapper>
        <TestComponent tKey="greeting" params={{ name: 'Keshav' }} />
      </Wrapper>
    );
    expect(screen.getByTestId('output').textContent).toBe('Hello, Keshav!');
  });

  it('preserves {{variable}} tokens for missing params', () => {
    render(
      <Wrapper>
        {/* name param intentionally omitted */}
        <TestComponent tKey="greeting" params={{}} />
      </Wrapper>
    );
    expect(screen.getByTestId('output').textContent).toBe('Hello, {{name}}!');
  });

  it('coerces numeric params to strings', () => {
    render(
      <Wrapper>
        <TestComponent tKey="items_plural" params={{ count: 5 }} />
      </Wrapper>
    );
    expect(screen.getByTestId('output').textContent).toBe('5 items');
  });
});

// ---------------------------------------------------------------------------
// Pluralization
// ---------------------------------------------------------------------------

describe('pluralization (count convention)', () => {
  it('uses the base key when count === 1', () => {
    render(
      <Wrapper>
        <TestComponent tKey="items" params={{ count: 1 }} />
      </Wrapper>
    );
    expect(screen.getByTestId('output').textContent).toBe('One item');
  });

  it('uses the _plural key when count !== 1', () => {
    render(
      <Wrapper>
        <TestComponent tKey="items" params={{ count: 3 }} />
      </Wrapper>
    );
    expect(screen.getByTestId('output').textContent).toBe('3 items');
  });

  it('falls back to the base key when _plural variant is absent', () => {
    const noPlural: TranslationDict = { items: 'An item' };
    render(
      <Wrapper localeOverride={{ en: noPlural }}>
        <TestComponent tKey="items" params={{ count: 5 }} />
      </Wrapper>
    );
    expect(screen.getByTestId('output').textContent).toBe('An item');
  });
});

// ---------------------------------------------------------------------------
// Locale fallback chain
// ---------------------------------------------------------------------------

describe('locale fallback', () => {
  beforeEach(() => {
    // Reset any previous SDK mock
    (window as unknown as Record<string, unknown>).addOnUISdk = undefined;
  });

  it('falls back to the primary subtag when the full locale is missing (es-ES → es)', async () => {
    const es: TranslationDict = { greeting: 'Hola, {{name}}!' };
    const mockSdk = {
      ready: Promise.resolve(),
      app: {
        ui: { locale: 'es-ES' },
        on: vi.fn(),
        off: vi.fn(),
      },
    };
    (window as unknown as Record<string, unknown>).addOnUISdk = mockSdk;

    await act(async () => {
      render(
        <I18nProvider locales={{ en, es }} defaultLocale="en">
          <TestComponent tKey="greeting" params={{ name: 'Ana' }} />
        </I18nProvider>
      );
    });

    const output = screen.getByTestId('output');
    expect(output.textContent).toBe('Hola, Ana!');
  });

  it('falls back to defaultLocale when neither the locale nor its primary subtag is available', async () => {
    const mockSdk = {
      ready: Promise.resolve(),
      app: {
        ui: { locale: 'ja-JP' },
        on: vi.fn(),
        off: vi.fn(),
      },
    };
    (window as unknown as Record<string, unknown>).addOnUISdk = mockSdk;

    await act(async () => {
      render(
        <I18nProvider locales={{ en, fr }} defaultLocale="en">
          <TestComponent tKey="only_in_en" />
        </I18nProvider>
      );
    });
    expect(screen.getByTestId('output').textContent).toBe('English only');
  });

  it('subscribes to localechange events and updates the locale', async () => {
    let capturedHandler: ((data: { locale: string }) => void) | null = null;

    const mockSdk = {
      ready: Promise.resolve(),
      app: {
        ui: { locale: 'en' },
        on: vi.fn((_: string, handler: (data: { locale: string }) => void) => {
          capturedHandler = handler;
        }),
        off: vi.fn(),
      },
    };
    (window as unknown as Record<string, unknown>).addOnUISdk = mockSdk;

    await act(async () => {
      render(
        <I18nProvider locales={{ en, fr }} defaultLocale="en">
          <TestComponent tKey="greeting" params={{ name: 'Test' }} />
        </I18nProvider>
      );
    });

    expect(screen.getByTestId('output').textContent).toBe('Hello, Test!');

    // Simulate the Adobe SDK firing a localechange event
    await act(async () => {
      capturedHandler!({ locale: 'fr' });
    });

    expect(screen.getByTestId('output').textContent).toBe('Bonjour, Test!');
  });

  it('calls sdk.off on unmount (no ghost handlers)', async () => {
    const offSpy = vi.fn();
    const mockSdk = {
      ready: Promise.resolve(),
      app: {
        ui: { locale: 'en' },
        on: vi.fn(),
        off: offSpy,
      },
    };
    (window as unknown as Record<string, unknown>).addOnUISdk = mockSdk;

    let unmount!: () => void;
    await act(async () => {
      ({ unmount } = render(
        <I18nProvider locales={{ en, fr }} defaultLocale="en">
          <TestComponent tKey="greeting" params={{ name: 'X' }} />
        </I18nProvider>
      ));
    });

    act(() => {
      unmount();
    });

    expect(offSpy).toHaveBeenCalledWith('localechange', expect.any(Function));
  });
});

// ---------------------------------------------------------------------------
// useTranslation guard
// ---------------------------------------------------------------------------

describe('useTranslation', () => {
  it('throws when used outside of I18nProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestComponent tKey="x" />)).toThrow(
      '[adobe-addon-i18n] useTranslation() must be called inside an <I18nProvider>.'
    );
    spy.mockRestore();
  });
});
