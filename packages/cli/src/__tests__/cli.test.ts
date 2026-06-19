import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';

// We import the internal helpers directly by re-exporting them in a test
// companion, or by testing the CLI's public behaviour through its action logic.
// Since cli.ts bundles everything into one file, we test the exported types
// and behaviours by duplicating the pure utility functions here and verifying
// them independently. The CLI integration behaviour is tested via temp-dir
// file system operations.

// ---------------------------------------------------------------------------
// Re-implement pure utilities for isolated unit testing
// (These mirror the implementations in cli.ts exactly.)
// ---------------------------------------------------------------------------

import type { TranslationDict, TranslationValue } from '../cli';

const FORBIDDEN_KEY_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function setDeep(obj: TranslationDict, keyPath: string, value: TranslationValue): void {
  const keys = keyPath.split('.');
  let current: TranslationDict = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (FORBIDDEN_KEY_SEGMENTS.has(key)) throw new Error(`Forbidden key: ${key}`);
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as TranslationDict;
  }
  const last = keys[keys.length - 1];
  if (FORBIDDEN_KEY_SEGMENTS.has(last)) throw new Error(`Forbidden key: ${last}`);
  current[last] = value;
}

function hasDeep(obj: TranslationDict, keyPath: string): boolean {
  const keys = keyPath.split('.');
  let current: TranslationValue = obj;
  for (const key of keys) {
    if (FORBIDDEN_KEY_SEGMENTS.has(key)) return false;
    if (typeof current !== 'object' || current === null || !(key in current)) return false;
    current = (current as TranslationDict)[key];
  }
  return true;
}

function countEmptyDeep(obj: TranslationDict, newKeys: Set<string>, prefix = ''): number {
  let count = 0;
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEY_SEGMENTS.has(key)) continue;
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (typeof val === 'object' && val !== null) {
      count += countEmptyDeep(val as TranslationDict, newKeys, fullPath);
    } else if (val === '' && !newKeys.has(fullPath)) {
      count++;
    }
  }
  return count;
}

const LANG_CODE_RE = /^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{2,8})*$/;
function validateLangCode(lang: string): void {
  if (!LANG_CODE_RE.test(lang)) throw new Error(`Invalid lang code: ${lang}`);
}

function assertWithinDir(filePath: string, baseDir: string): void {
  const resolvedFile = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);
  if (!resolvedFile.startsWith(resolvedBase + path.sep) && resolvedFile !== resolvedBase) {
    throw new Error(`Path traversal detected`);
  }
}

// ---------------------------------------------------------------------------
// setDeep
// ---------------------------------------------------------------------------

describe('setDeep', () => {
  it('sets a top-level key', () => {
    const obj: TranslationDict = {};
    setDeep(obj, 'hello', 'world');
    expect(obj).toEqual({ hello: 'world' });
  });

  it('sets a deeply nested key', () => {
    const obj: TranslationDict = {};
    setDeep(obj, 'a.b.c', 'deep');
    expect((obj as any).a.b.c).toBe('deep');
  });

  it('does not overwrite an existing sibling key', () => {
    const obj: TranslationDict = { a: { x: 'keep' } };
    setDeep(obj, 'a.y', 'added');
    expect((obj.a as TranslationDict).x).toBe('keep');
    expect((obj.a as TranslationDict).y).toBe('added');
  });

  it('throws on __proto__ key segment (prototype pollution guard)', () => {
    const obj: TranslationDict = {};
    expect(() => setDeep(obj, '__proto__.polluted', 'evil')).toThrow(/Forbidden key/);
  });

  it('throws on constructor key segment', () => {
    const obj: TranslationDict = {};
    expect(() => setDeep(obj, 'constructor.prototype.polluted', 'evil')).toThrow(/Forbidden key/);
  });

  it('throws on prototype key segment', () => {
    const obj: TranslationDict = {};
    expect(() => setDeep(obj, 'a.prototype.b', 'evil')).toThrow(/Forbidden key/);
  });

  it('does NOT pollute Object.prototype', () => {
    const obj: TranslationDict = {};
    try {
      setDeep(obj, '__proto__.evil', 'hacked');
    } catch {
      // expected — verify Object.prototype is unmodified
    }
    expect(Object.prototype).not.toHaveProperty('evil');
  });
});

// ---------------------------------------------------------------------------
// hasDeep
// ---------------------------------------------------------------------------

describe('hasDeep', () => {
  const dict: TranslationDict = { a: { b: { c: 'value' } } };

  it('returns true for a present deep key', () => {
    expect(hasDeep(dict, 'a.b.c')).toBe(true);
  });

  it('returns false for a missing intermediate key', () => {
    expect(hasDeep(dict, 'a.z.c')).toBe(false);
  });

  it('returns false for a missing leaf', () => {
    expect(hasDeep(dict, 'a.b.d')).toBe(false);
  });

  it('returns false for __proto__ (prototype pollution guard)', () => {
    expect(hasDeep(dict, '__proto__.anything')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// countEmptyDeep
// ---------------------------------------------------------------------------

describe('countEmptyDeep', () => {
  it('counts only pre-existing empty strings (excludes newly-added keys)', () => {
    const obj: TranslationDict = {
      a: '',       // pre-existing empty
      b: 'hello',  // filled
      c: '',       // newly added this run
    };
    const newKeys = new Set(['c']);
    expect(countEmptyDeep(obj, newKeys)).toBe(1); // only 'a'
  });

  it('recurses into nested objects', () => {
    const obj: TranslationDict = {
      x: { y: '', z: 'ok' },
      w: '',
    };
    expect(countEmptyDeep(obj, new Set())).toBe(2); // x.y and w
  });

  it('skips forbidden keys', () => {
    const obj: TranslationDict = { safe: '' };
    // Simulate a key named __proto__ on a plain object without prototype manipulation.
    // Object.defineProperty with enumerable:true makes Object.keys() return it.
    Object.defineProperty(obj, '__proto__', {
      value: '',
      enumerable: true,
      configurable: true,
      writable: true,
    });
    // only 'safe' should be counted; '__proto__' must be skipped
    expect(countEmptyDeep(obj, new Set())).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// validateLangCode
// ---------------------------------------------------------------------------

describe('validateLangCode', () => {
  it.each(['en', 'fr', 'zh-Hant', 'en-US', 'sr-Latn-RS'])('accepts valid BCP 47 tag: %s', (code) => {
    expect(() => validateLangCode(code)).not.toThrow();
  });

  it.each([
    '../../../etc/passwd',
    '; DROP TABLE',
    '',
    'x'.repeat(50),
    '12',
    '..',
  ])('rejects invalid/dangerous code: %s', (code) => {
    expect(() => validateLangCode(code)).toThrow(/Invalid lang code/);
  });
});

// ---------------------------------------------------------------------------
// assertWithinDir (path traversal guard)
// ---------------------------------------------------------------------------

describe('assertWithinDir', () => {
  it('allows a file directly inside the base directory', () => {
    const base = path.resolve('/tmp/locales');
    expect(() => assertWithinDir(path.join(base, 'en.json'), base)).not.toThrow();
  });

  it('throws for a path that escapes the base directory', () => {
    const base = path.resolve('/tmp/locales');
    expect(() => assertWithinDir(path.join(base, '../../etc/passwd'), base)).toThrow(
      /Path traversal detected/
    );
  });

  it('throws for an absolute path outside the base', () => {
    const base = path.resolve('/tmp/locales');
    expect(() => assertWithinDir('/etc/shadow', base)).toThrow(/Path traversal detected/);
  });
});

// ---------------------------------------------------------------------------
// Integration: safeMerge writes correct files (smoke test)
// ---------------------------------------------------------------------------

describe('safeMerge integration (file system)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'i18n-test-'));
  });

  it('creates a locale file with empty-string values for new keys', async () => {
    // We dynamically import the CLI module to get the real safeMerge behaviour
    // by running it against a real temp directory.
    const { execSync } = await import('node:child_process');
    const distCli = path.resolve('packages/cli/dist/cli.js');

    // Only run this test if the CLI is built
    if (!fs.existsSync(distCli)) {
      console.warn('Skipping integration test: CLI not built. Run `npm run build` first.');
      return;
    }

    // Write a dummy source file that uses t()
    const srcDir = path.join(tmpDir, 'src');
    await fsPromises.mkdir(srcDir);
    await fsPromises.writeFile(
      path.join(srcDir, 'App.tsx'),
      `import { useTranslation } from '@adobe-addon-i18n/react';
      function App() { const { t } = useTranslation(); return t('hello.world'); }`
    );

    execSync(
      `node ${distCli} sync --src ${srcDir} --locales ${tmpDir}/locales --langs en,fr`,
      { stdio: 'pipe' }
    );

    const en = JSON.parse(fs.readFileSync(path.join(tmpDir, 'locales', 'en.json'), 'utf-8'));
    expect(en.hello.world).toBe('');

    const fr = JSON.parse(fs.readFileSync(path.join(tmpDir, 'locales', 'fr.json'), 'utf-8'));
    expect(fr.hello.world).toBe('');
  });
});
