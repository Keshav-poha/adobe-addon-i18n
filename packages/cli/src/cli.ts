#!/usr/bin/env node
import { cac } from 'cac';
import { Project, Node, CallExpression } from 'ts-morph';
import path from 'node:path';
import fs from 'node:fs';

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

function safeMerge(localesDir: string, langs: string[], keys: Set<string>) {
  if (!fs.existsSync(localesDir)) {
    fs.mkdirSync(localesDir, { recursive: true });
  }

  const langsList = langs.map(l => l.trim());

  for (const lang of langsList) {
    const filePath = path.join(localesDir, `${lang}.json`);
    let currentData: Record<string, any> = {};

    if (fs.existsSync(filePath)) {
      try {
        currentData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch (e) {
        console.error(`Error parsing ${filePath}: ${(e as Error).message}`);
        continue;
      }
    }

    let newCount = 0;
    let missingCount = 0;

    for (const key of keys) {
      if (!(key in currentData)) {
        currentData[key] = "";
        newCount++;
      }
    }

    for (const key of Object.keys(currentData)) {
      if (currentData[key] === "") {
        missingCount++;
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(currentData, null, 2), 'utf-8');

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
  .action((options) => {
    console.log(`Starting adobe-addon-i18n sync...`);
    const srcPath = path.resolve(process.cwd(), options.src);
    const localesPath = path.resolve(process.cwd(), options.locales);
    const langs = options.langs.split(',');

    const keys = extractKeys(srcPath);
    safeMerge(localesPath, langs, keys);
    console.log(`\nSync complete!`);
  });

cli.help();
cli.parse();
