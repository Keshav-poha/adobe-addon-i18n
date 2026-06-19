#!/usr/bin/env node
import { cac } from 'cac';
import { Project, Node, CallExpression } from 'ts-morph';
import path from 'node:path';
import fs from 'node:fs';

import fsPromises from 'node:fs/promises';

const cli = cac('adobe-addon-i18n');

function isTranslationCall(node: CallExpression): boolean {
  const expr = node.getExpression();
  // We only look for calls to `t` since we assume `const { t } = useTranslation();`
  return expr.getText() === 't';
}

function extractKeys(srcPath: string): Set<string> {
  const project = new Project();
  const globPattern = path.join(srcPath, '**/*.{ts,tsx,js,jsx}').replace(/\\/g, '/');
  project.addSourceFilesAtPaths(globPattern);

  const keys = new Set<string>();

  for (const sourceFile of project.getSourceFiles()) {
    // Only process files that import useTranslation
    const hasImport = sourceFile.getImportDeclarations().some(imp => 
      imp.getNamedImports().some(named => named.getName() === 'useTranslation')
    );
    if (!hasImport) continue;

    sourceFile.forEachDescendant((node: Node) => {
      if (Node.isCallExpression(node) && isTranslationCall(node)) {
        const args = node.getArguments();
        if (args.length > 0) {
          const firstArg = args[0];
          if (Node.isStringLiteral(firstArg)) {
            keys.add(firstArg.getLiteralText());
          }
        }
      }
    });
  }

  return keys;
}

function setDeep(obj: any, path: string, value: any) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] !== undefined && typeof current[key] !== 'object') {
      console.warn(`[adobe-addon-i18n] Warning: Overwriting non-object key '${key}' at path '${path}'`);
    }
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

function hasDeep(obj: any, path: string): boolean {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current === undefined || current === null || !(key in current)) return false;
    current = current[key];
  }
  return true;
}

function countEmptyDeep(obj: any): number {
  let count = 0;
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      count += countEmptyDeep(obj[key]);
    } else if (obj[key] === "") {
      count++;
    }
  }
  return count;
}

async function safeMerge(localesDir: string, langs: string[], keys: Set<string>) {
  if (!fs.existsSync(localesDir)) {
    await fsPromises.mkdir(localesDir, { recursive: true });
  }

  const langsList = langs.map(l => l.trim());

  for (const lang of langsList) {
    const filePath = path.join(localesDir, `${lang}.json`);
    let currentData: Record<string, any> = {};

    if (fs.existsSync(filePath)) {
      try {
        currentData = JSON.parse(await fsPromises.readFile(filePath, 'utf-8'));
      } catch (e) {
        console.error(`Error parsing ${filePath}: ${(e as Error).message}`);
        continue;
      }
    }

    let newCount = 0;
    let missingCount = 0;

    for (const key of keys) {
      if (!hasDeep(currentData, key)) {
        setDeep(currentData, key, "");
        newCount++;
      }
    }

    missingCount = countEmptyDeep(currentData);

    const tmpPath = filePath + '.tmp';
    await fsPromises.writeFile(tmpPath, JSON.stringify(currentData, null, 2), 'utf-8');
    await fsPromises.rename(tmpPath, filePath);

    console.log(`\nLocale: ${lang}`);
    console.log(`  - Total unique keys: ${keys.size}`);
    console.log(`  - New keys added:    ${newCount}`);
    console.log(`  - Missing values:    ${missingCount}`);
  }
}

cli.command('sync', 'Sync AST and translation files')
  .option('--src <path>', 'Source directory', { default: './src' })
  .option('--locales <path>', 'Locales directory', { default: './locales' })
  .option('--langs <list>', 'Comma-separated supported locales', { default: 'en' })
  .action(async (options) => {
    console.log(`Starting adobe-addon-i18n sync...`);
    const srcPath = path.resolve(process.cwd(), options.src);
    const localesPath = path.resolve(process.cwd(), options.locales);
    const langs = options.langs.split(',');

    const keys = extractKeys(srcPath);
    await safeMerge(localesPath, langs, keys);
    console.log(`\nSync complete!`);
  });

async function translateText(text: string, srcLang: string, targetLang: string): Promise<string> {
  const tokens: string[] = [];
  const tokenized = text.replace(/\{\{.*?\}\}/g, (m) => { tokens.push(m); return `__${tokens.length - 1}__`; });
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${srcLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(tokenized)}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) throw new Error(`Translation API error: ${res.statusText}`);
  const data = await res.json();
  const translated = data[0].map((x: any) => x[0]).join('');
  return translated.replace(/__(\d+)__/g, (match: string, i: string) => {
    const idx = parseInt(i);
    return idx < tokens.length ? tokens[idx] : match;
  });
}

function getMissingKeys(obj: any, sourceObj: any, prefix = '', missing: { path: string, sourceText: string }[] = []): { path: string, sourceText: string }[] {
  for (const key of Object.keys(obj)) {
    const newPrefix = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      getMissingKeys(obj[key], sourceObj?.[key] || {}, newPrefix, missing);
    } else if (obj[key] === "" && typeof sourceObj?.[key] === 'string') {
      missing.push({ path: newPrefix, sourceText: sourceObj[key] });
    }
  }
  return missing;
}

cli.command('translate', 'Translate missing keys')
  .option('--src <lang>', 'Source language', { default: 'en' })
  .option('--locales <path>', 'Locales directory', { default: './locales' })
  .action(async (options) => {
    console.log(`Starting translation...`);
    const localesPath = path.resolve(process.cwd(), options.locales);
    const srcPath = path.join(localesPath, `${options.src}.json`);
    if (!fs.existsSync(srcPath)) return console.error(`Source file not found: ${srcPath}`);
    
    const srcData = JSON.parse(await fsPromises.readFile(srcPath, 'utf-8'));
    const files = await fsPromises.readdir(localesPath);
    
    for (const file of files) {
      if (!file.endsWith('.json') || file === `${options.src}.json`) continue;
      const targetLang = file.replace('.json', '');
      const targetPath = path.join(localesPath, file);
      const targetData = JSON.parse(await fsPromises.readFile(targetPath, 'utf-8'));
      
      const missing = getMissingKeys(targetData, srcData);
      if (missing.length === 0) continue;
      console.log(`Translating ${missing.length} keys for ${targetLang}...`);
      
      for (const m of missing) {
        try {
          const translated = await translateText(m.sourceText, options.src, targetLang);
          setDeep(targetData, m.path, translated);
        } catch (e: any) {
          console.error(`Failed to translate '${m.path}': ${e.message}`);
        }
      }
      const tmpPath = targetPath + '.tmp';
      await fsPromises.writeFile(tmpPath, JSON.stringify(targetData, null, 2), 'utf-8');
      await fsPromises.rename(tmpPath, targetPath);
      console.log(`Translated ${targetLang}`);
    }
  });

cli.help();
cli.parse();
