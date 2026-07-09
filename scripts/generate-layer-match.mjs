#!/usr/bin/env node
/**
 * R1 — emit bin/ark-layer-match.mjs from the canonical TypeScript algorithm.
 *
 * Canonical: src/domain/layerMatch.ts
 * Derived:   bin/ark-layer-match.mjs  (committed for zero-build CLI on npm)
 *
 * Usage:
 *   node scripts/generate-layer-match.mjs           # write derived artifact
 *   node scripts/generate-layer-match.mjs --check   # exit 1 if derived is stale
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const CANONICAL = path.join(root, 'src/domain/layerMatch.ts');
const DERIVED = path.join(root, 'bin/ark-layer-match.mjs');

const GENERATED_BANNER = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/layerMatch.ts
 * Regenerate: node scripts/generate-layer-match.mjs
 * Drift check: node scripts/generate-layer-match.mjs --check
 *
 * Pure layer-glob matching for ark.config.json (CLI load path).
 * CLI-only layerForFile (Node path resolution) is appended below the pure core.
 */
`;

/** CLI-only helper: absolute path → layer via the pure relative matcher. */
const LAYER_FOR_FILE_APPENDIX = `
import path from 'node:path';

/**
 * Resolve a file's architecture layer from ark.config.json layer glob patterns.
 * Uses Node path resolution, then the pure layerForRelativePath classifier.
 */
export function layerForFile(root, file, layers) {
  const abs = path.isAbsolute(file) ? file : path.resolve(root, file);
  const rel = path.relative(root, abs).split(path.sep).join('/');
  return layerForRelativePath(rel, layers);
}
`;

function stripLeadingBlockComment(js) {
  const trimmed = js.replace(/^\uFEFF/, '');
  if (!trimmed.startsWith('/*')) return trimmed;
  const end = trimmed.indexOf('*/');
  if (end === -1) return trimmed;
  return trimmed.slice(end + 2).replace(/^\s*\n/, '');
}

function buildDerivedSource(canonicalTs) {
  const { outputText, diagnostics } = ts.transpileModule(canonicalTs, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      removeComments: false,
    },
    fileName: 'layerMatch.ts',
    reportDiagnostics: true,
  });

  if (diagnostics?.length) {
    const msg = diagnostics
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
      .join('\n');
    throw new Error(`transpile layerMatch.ts failed:\n${msg}`);
  }

  // Pure core first (no node:path). CLI helper import + layerForFile last.
  const pure = stripLeadingBlockComment(outputText).trimEnd() + '\n';
  return `${GENERATED_BANNER}\n${pure}\n${LAYER_FOR_FILE_APPENDIX}`;
}

function normalizeNewlines(s) {
  return s.replace(/\r\n/g, '\n');
}

function main() {
  const checkOnly = process.argv.includes('--check');
  if (!fs.existsSync(CANONICAL)) {
    console.error(`Missing canonical source: ${path.relative(root, CANONICAL)}`);
    process.exit(2);
  }

  const canonicalTs = fs.readFileSync(CANONICAL, 'utf8');
  const expected = normalizeNewlines(buildDerivedSource(canonicalTs));

  if (checkOnly) {
    if (!fs.existsSync(DERIVED)) {
      console.error(
        `Derived layer matcher missing: ${path.relative(root, DERIVED)}\n` +
          'Run: node scripts/generate-layer-match.mjs'
      );
      process.exit(1);
    }
    const actual = normalizeNewlines(fs.readFileSync(DERIVED, 'utf8'));
    if (actual !== expected) {
      console.error(
        'bin/ark-layer-match.mjs is out of date with src/domain/layerMatch.ts.\n' +
          'Regenerate: node scripts/generate-layer-match.mjs\n' +
          '(or: npm run generate:layer-match)'
      );
      process.exit(1);
    }
    console.log('✔ layer-match derived artifact is up to date.');
    return;
  }

  fs.mkdirSync(path.dirname(DERIVED), { recursive: true });
  fs.writeFileSync(DERIVED, expected, 'utf8');
  console.log(`Wrote ${path.relative(root, DERIVED)} from ${path.relative(root, CANONICAL)}`);
}

main();
