#!/usr/bin/env node
import { cac } from 'cac';
import { Project, Node, CallExpression } from 'ts-morph';
import path from 'node:path';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A translation value is either a plain string or a nested dictionary of the
 * same type. Using a proper recursive type instead of `any` prevents prototype
 * pollution at the type level and makes the compiler enforce correct usage.
 */
export type TranslationValue = string | TranslationDict;
export type TranslationDict = { [key: string]: TranslationValue };

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------

/**
 * Keys that must never be used as object property names because they walk up
 * the prototype chain and pollute Object.prototype (prototype pollution attack).
 */
const FORBIDDEN_KEY_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * BCP 47 language tag pattern — strict allowlist so that lang codes cannot
 * contain path separators, shell metacharacters, or URL injection payloads.
 * Examples of valid tags: en, en-US, zh-Hant, sr-Latn-RS
 */
const LANG_CODE_RE = /^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{2,8})*$/;

function validateLangCode(lang: string): void {
  if (!LANG_CODE_RE.test(lang)) {
    throw new Error(
      `Invalid language code: "${lang}". ` +
        `Language codes must be valid BCP 47 tags (e.g. "en", "en-US", "zh-Hant").`
    );
  }
}

/**
 * Ensures the resolved file path stays within the intended base directory,
 * preventing path traversal attacks (e.g. --langs "../../etc/passwd").
 */
function assertWithinDir(filePath: string, baseDir: string): void {
  const resolvedFile = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);
  if (!resolvedFile.startsWith(resolvedBase + path.sep) && resolvedFile !== resolvedBase) {
    throw new Error(
      `Path traversal detected: "${filePath}" resolves outside the allowed directory "${baseDir}".`
    );
  }
}

// ---------------------------------------------------------------------------
// Deep-object utilities (prototype-safe)
// ---------------------------------------------------------------------------

function setDeep(obj: TranslationDict, keyPath: string, value: TranslationValue): void {
  const keys = keyPath.split('.');
  let current: TranslationDict = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];

    if (FORBIDDEN_KEY_SEGMENTS.has(key)) {
      throw new Error(`Forbidden key segment "${key}" in path "${keyPath}" (prototype pollution guard).`);
    }

    const existing = current[key];

    if (existing !== undefined && typeof existing !== 'object') {
      console.warn(
        `[adobe-addon-i18n] Warning: Overwriting non-object key "${key}" at path "${keyPath}"`
      );
    }

    if (existing === undefined || existing === null || typeof existing !== 'object') {
      current[key] = {};
    }

    current = current[key] as TranslationDict;
  }

  const lastKey = keys[keys.length - 1];
  if (FORBIDDEN_KEY_SEGMENTS.has(lastKey)) {
    throw new Error(`Forbidden key segment "${lastKey}" in path "${keyPath}" (prototype pollution guard).`);
  }

  current[lastKey] = value;
}

function hasDeep(obj: TranslationDict, keyPath: string): boolean {
  const keys = keyPath.split('.');
  let current: TranslationValue = obj;

  for (const key of keys) {
    if (FORBIDDEN_KEY_SEGMENTS.has(key)) return false;
    if (current === undefined || current === null || typeof current !== 'object') return false;
    if (!(key in current)) return false;
    current = (current as TranslationDict)[key];
  }

  return true;
}

/**
 * Counts empty-string leaf values in a translation dictionary.
 * Only counts values that were already empty *before* this sync run by
 * receiving a Set of keys that were newly added — those are excluded from the count.
 */
function countEmptyDeep(obj: TranslationDict, newKeys: Set<string>, prefix = ''): number {
  let count = 0;

  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEY_SEGMENTS.has(key)) continue;

    const fullPath = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];

    if (typeof val === 'object' && val !== null) {
      count += countEmptyDeep(val as TranslationDict, newKeys, fullPath);
    } else if (val === '' && !newKeys.has(fullPath)) {
      // Only count as "missing" if it was already empty before this run
      count++;
    }
  }

  return count;
}

/**
 * Validates that a JSON.parse result is a plain non-null object (TranslationDict).
 * Rejects arrays, primitives, and null, which would silently corrupt downstream
 * operations.
 */
function assertTranslationDict(data: unknown, filePath: string): TranslationDict {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(
      `Expected a JSON object in "${filePath}" but got: ${Array.isArray(data) ? 'array' : typeof data}`
    );
  }
  return data as TranslationDict;
}

// ---------------------------------------------------------------------------
// AST key extraction
// ---------------------------------------------------------------------------

function isTranslationCall(node: CallExpression): boolean {
  return node.getExpression().getText() === 't';
}

function extractKeys(srcPath: string): Set<string> {
  // Resolve the user's tsconfig.json so that path aliases and compiler options
  // from the actual project are respected by ts-morph (SCALABILITY-02).
  const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
  const project = fs.existsSync(tsconfigPath)
    ? new Project({ tsConfigFilePath: tsconfigPath, skipAddingFilesFromTsConfig: true })
    : new Project();

  const globPattern = path.join(srcPath, '**/*.{ts,tsx,js,jsx}').replace(/\\/g, '/');
  project.addSourceFilesAtPaths(globPattern);

  const keys = new Set<string>();

  for (const sourceFile of project.getSourceFiles()) {
    // Only process files that import useTranslation
    const hasImport = sourceFile
      .getImportDeclarations()
      .some((imp) =>
        imp.getNamedImports().some((named) => named.getName() === 'useTranslation')
      );
    if (!hasImport) continue;

    sourceFile.forEachDescendant((node: Node) => {
      if (Node.isCallExpression(node) && isTranslationCall(node)) {
        const args = node.getArguments();
        if (args.length > 0) {
          const firstArg = args[0];
          if (Node.isStringLiteral(firstArg)) {
            keys.add(firstArg.getLiteralText());
          } else {
            // ARCH-03: Warn about dynamic/non-literal keys that cannot be statically extracted.
            console.warn(
              `[adobe-addon-i18n] Warning: Non-literal key detected in ` +
                `${sourceFile.getFilePath()}:${node.getStartLineNumber()} — ` +
                `"t(${firstArg.getText()})" cannot be statically extracted. ` +
                `Add this key to your JSON files manually.`
            );
          }
        }
      }
    });
  }

  return keys;
}

// ---------------------------------------------------------------------------
// Safe merge (sync command)
// ---------------------------------------------------------------------------

async function safeMerge(localesDir: string, langs: string[], keys: Set<string>): Promise<void> {
  if (!fs.existsSync(localesDir)) {
    await fsPromises.mkdir(localesDir, { recursive: true });
  }

  for (const lang of langs) {
    // Security: validate the lang code before using it as a filename.
    validateLangCode(lang);

    const filePath = path.join(localesDir, `${lang}.json`);

    // Security: assert the constructed path stays inside localesDir.
    assertWithinDir(filePath, localesDir);

    let currentData: TranslationDict = {};

    if (fs.existsSync(filePath)) {
      try {
        const raw = JSON.parse(await fsPromises.readFile(filePath, 'utf-8')) as unknown;
        currentData = assertTranslationDict(raw, filePath);
      } catch (e) {
        console.error(`Error parsing ${filePath}: ${(e as Error).message}`);
        continue;
      }
    }

    let newCount = 0;
    const newlyAddedKeys = new Set<string>();

    for (const key of keys) {
      if (!hasDeep(currentData, key)) {
        setDeep(currentData, key, '');
        newCount++;
        newlyAddedKeys.add(key);
      }
    }

    // Count only pre-existing empty keys (excludes the ones we just added).
    const missingCount = countEmptyDeep(currentData, newlyAddedKeys);

    const tmpPath = filePath + '.tmp';
    await fsPromises.writeFile(tmpPath, JSON.stringify(currentData, null, 2), 'utf-8');
    await fsPromises.rename(tmpPath, filePath);

    console.log(`\nLocale: ${lang}`);
    console.log(`  - Total unique keys:        ${keys.size}`);
    console.log(`  - New keys added:            ${newCount}`);
    console.log(`  - Pre-existing empty values: ${missingCount}`);
  }
}

// ---------------------------------------------------------------------------
// Translation engine
// ---------------------------------------------------------------------------

/**
 * Unicode Private Use Area sentinel characters used to protect `{{variables}}`
 * during translation. These are invisible to human readers, ignored by Google
 * Translate, and cannot appear in normal prose — making them far more robust
 * than the previous `__N__` numeric token scheme, which Google Translate would
 * occasionally mutate (e.g. `__0__` → `__ 0 __` or `__O__`).
 *
 * Format: \uE000<index>\uE001  (PUA start + decimal index + PUA end)
 */
const TOKEN_START = '\uE000';
const TOKEN_END = '\uE001';
const TOKEN_RE = new RegExp(`${TOKEN_START}(\\d+)${TOKEN_END}`, 'g');

async function translateText(text: string, srcLang: string, targetLang: string): Promise<string> {
  const tokens: string[] = [];

  // Replace {{variables}} with PUA sentinel tokens before sending to Google.
  const tokenized = text.replace(/\{\{.*?\}\}/g, (m) => {
    tokens.push(m);
    return `${TOKEN_START}${tokens.length - 1}${TOKEN_END}`;
  });

  const url =
    `https://translate.googleapis.com/translate_a/single` +
    `?client=gtx&sl=${encodeURIComponent(srcLang)}&tl=${encodeURIComponent(targetLang)}&dt=t` +
    `&q=${encodeURIComponent(tokenized)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    throw new Error(`Translation API returned HTTP ${res.status}: ${res.statusText}`);
  }

  const data = (await res.json()) as unknown[][];
  const translated = (data[0] as [string, ...unknown[]][]).map((x) => x[0]).join('');

  // Restore original {{variable}} tokens from PUA sentinels.
  return translated.replace(TOKEN_RE, (_match, i: string) => {
    const idx = parseInt(i, 10);
    return idx < tokens.length ? tokens[idx] : _match;
  });
}

/**
 * Recursively collect leaf paths whose value is `""` in `obj` but have a
 * non-empty string in the parallel `sourceObj` tree.
 */
function getMissingKeys(
  obj: TranslationDict,
  sourceObj: TranslationDict,
  prefix = '',
  missing: { path: string; sourceText: string }[] = []
): { path: string; sourceText: string }[] {
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEY_SEGMENTS.has(key)) continue;

    const newPrefix = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    const srcVal = (sourceObj as TranslationDict)[key];

    if (typeof val === 'object' && val !== null) {
      getMissingKeys(
        val as TranslationDict,
        typeof srcVal === 'object' && srcVal !== null ? (srcVal as TranslationDict) : {},
        newPrefix,
        missing
      );
    } else if (val === '' && typeof srcVal === 'string' && srcVal !== '') {
      missing.push({ path: newPrefix, sourceText: srcVal });
    }
  }

  return missing;
}

/**
 * Runs a list of async tasks with a bounded concurrency window.
 * This prevents opening thousands of simultaneous HTTP connections when
 * translating a large number of keys across many languages.
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const taskIndex = index++;
      try {
        results[taskIndex] = { status: 'fulfilled', value: await tasks[taskIndex]() };
      } catch (e) {
        results[taskIndex] = { status: 'rejected', reason: e };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// CLI commands
// ---------------------------------------------------------------------------

const cli = cac('adobe-addon-i18n');

cli
  .command('sync', 'Sync AST-extracted keys into locale JSON files')
  .option('--src <path>', 'Source directory to scan for t() calls', { default: './src' })
  .option('--locales <path>', 'Locales directory', { default: './locales' })
  .option('--langs <list>', 'Comma-separated BCP 47 language tags', { default: 'en' })
  .action(async (options: { src: string; locales: string; langs: string }) => {
    console.log('Starting adobe-addon-i18n sync...');
    const srcPath = path.resolve(process.cwd(), options.src);
    const localesPath = path.resolve(process.cwd(), options.locales);
    const langs = options.langs.split(',').map((l) => l.trim()).filter(Boolean);

    const keys = extractKeys(srcPath);
    await safeMerge(localesPath, langs, keys);
    console.log('\nSync complete!');
  });

cli
  .command('translate', 'Auto-translate missing keys via Google Translate')
  .option('--src <lang>', 'Source language code (BCP 47)', { default: 'en' })
  .option('--locales <path>', 'Locales directory', { default: './locales' })
  .option('--no-translate', 'Skip network calls — only validate; useful in air-gapped or enterprise environments')
  .option('--concurrency <n>', 'Max parallel translation requests', { default: 5 })
  .action(
    async (options: {
      src: string;
      locales: string;
      'no-translate': boolean;
      concurrency: number;
    }) => {
      if (options['no-translate']) {
        console.log(
          '[adobe-addon-i18n] --no-translate flag set. Skipping all API calls. ' +
            'Fill in empty keys in your locale JSON files manually.'
        );
        return;
      }

      console.log(
        '[adobe-addon-i18n] Notice: The translate command uses the unofficial Google Translate\n' +
          '  scraper endpoint (client=gtx). Your translation key strings are sent to Google\n' +
          '  servers. Do not use this command if your strings contain confidential data.\n' +
          '  Pass --no-translate to suppress this behaviour.\n'
      );

      // Validate the source language code.
      validateLangCode(options.src);

      const localesPath = path.resolve(process.cwd(), options.locales);
      const srcFilePath = path.join(localesPath, `${options.src}.json`);

      if (!fs.existsSync(srcFilePath)) {
        console.error(`Source locale file not found: ${srcFilePath}`);
        process.exit(1);
      }

      const srcRaw = JSON.parse(await fsPromises.readFile(srcFilePath, 'utf-8')) as unknown;
      const srcData = assertTranslationDict(srcRaw, srcFilePath);

      const files = await fsPromises.readdir(localesPath);
      const concurrency = Math.max(1, Number(options.concurrency) || 5);

      for (const file of files) {
        if (!file.endsWith('.json') || file === `${options.src}.json`) continue;

        const targetLang = file.slice(0, -'.json'.length);

        // Security: validate the filename-derived lang code before using it in the URL.
        try {
          validateLangCode(targetLang);
        } catch {
          console.warn(
            `[adobe-addon-i18n] Skipping "${file}" — filename does not form a valid BCP 47 tag.`
          );
          continue;
        }

        const targetPath = path.join(localesPath, file);
        assertWithinDir(targetPath, localesPath);

        const targetRaw = JSON.parse(await fsPromises.readFile(targetPath, 'utf-8')) as unknown;
        const targetData = assertTranslationDict(targetRaw, targetPath);

        const missing = getMissingKeys(targetData, srcData);
        if (missing.length === 0) continue;

        console.log(`Translating ${missing.length} keys for "${targetLang}"...`);

        // Build tasks and run them with bounded concurrency (SCALABILITY-01).
        const tasks = missing.map(
          (m) => () =>
            translateText(m.sourceText, options.src, targetLang).then((translated) => {
              setDeep(targetData, m.path, translated);
            })
        );

        const results = await runWithConcurrency(tasks, concurrency);
        const failures = results.filter((r) => r.status === 'rejected');

        if (failures.length > 0) {
          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            if (r.status === 'rejected') {
              console.error(
                `  Failed to translate "${missing[i].path}": ${(r.reason as Error).message}`
              );
            }
          }
        }

        const tmpPath = targetPath + '.tmp';
        await fsPromises.writeFile(tmpPath, JSON.stringify(targetData, null, 2), 'utf-8');
        await fsPromises.rename(tmpPath, targetPath);

        const successCount = results.filter((r) => r.status === 'fulfilled').length;
        console.log(`  Done: ${successCount}/${missing.length} keys translated for "${targetLang}".`);
      }
    }
  );

cli.help();
cli.parse();
