#!/usr/bin/env node
/**
 * R4 — emit pure CLI helpers from Domain TypeScript sources.
 *
 * Canonical → derived (committed for zero-build CLI on npm):
 *   src/domain/remediation.ts  → bin/lib/remediation.mjs
 *   src/domain/baselineKey.ts  → bin/lib/baseline-key.mjs
 *   src/domain/configContract.ts → bin/lib/config-contract.mjs
 *                                → schemas/ark.config.schema.json
 *
 * Layer match remains scripts/generate-layer-match.mjs (R1).
 *
 * Usage:
 *   node scripts/generate-cli-pure.mjs
 *   node scripts/generate-cli-pure.mjs --check
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const MODULES = [
  {
    canonical: 'src/domain/remediation.ts',
    derived: 'bin/lib/remediation.mjs',
    label: 'remediation classifier + fix-class enrich',
  },
  {
    canonical: 'src/domain/baselineKey.ts',
    derived: 'bin/lib/baseline-key.mjs',
    label: 'baseline violation key',
  },
  {
    canonical: 'src/domain/configContract.ts',
    derived: 'bin/lib/config-contract.mjs',
    schemaDerived: 'schemas/ark.config.schema.json',
    label: 'versioned ark.config.json contract + schema',
  },
];

function banner(canonicalRel, derivedRel) {
  return `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: ${canonicalRel}
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (${derivedRel}). Zero Node I/O.
 */
`;
}

function stripLeadingBlockComment(js) {
  const trimmed = js.replace(/^\uFEFF/, '');
  if (!trimmed.startsWith('/*')) return trimmed;
  const end = trimmed.indexOf('*/');
  if (end === -1) return trimmed;
  return trimmed.slice(end + 2).replace(/^\s*\n/, '');
}

function buildDerivedSource(canonicalRel, canonicalTs) {
  const { outputText, diagnostics } = ts.transpileModule(canonicalTs, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      removeComments: false,
    },
    fileName: path.basename(canonicalRel),
    reportDiagnostics: true,
  });

  if (diagnostics?.length) {
    const msg = diagnostics
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
      .join('\n');
    throw new Error(`transpile ${canonicalRel} failed:\n${msg}`);
  }

  const pure = stripLeadingBlockComment(outputText).trimEnd() + '\n';
  const derivedRel = MODULES.find((m) => m.canonical === canonicalRel).derived;
  return `${banner(canonicalRel, derivedRel)}\n${pure}`;
}

function normalizeNewlines(s) {
  return s.replace(/\r\n/g, '\n');
}

async function buildSchemaSource(derivedSource) {
  const url = `data:text/javascript;base64,${Buffer.from(derivedSource).toString('base64')}`;
  const module = await import(url);
  if (!module.ARK_CONFIG_SCHEMA || typeof module.ARK_CONFIG_SCHEMA !== 'object') {
    throw new Error('configContract.ts must export ARK_CONFIG_SCHEMA');
  }
  return `${JSON.stringify(module.ARK_CONFIG_SCHEMA, null, 2)}\n`;
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  let failed = false;

  for (const mod of MODULES) {
    const canonicalPath = path.join(root, mod.canonical);
    const derivedPath = path.join(root, mod.derived);
    if (!fs.existsSync(canonicalPath)) {
      console.error(`Missing canonical source: ${mod.canonical}`);
      process.exit(2);
    }
    const canonicalTs = fs.readFileSync(canonicalPath, 'utf8');
    const expected = normalizeNewlines(buildDerivedSource(mod.canonical, canonicalTs));
    const expectedSchema = mod.schemaDerived
      ? normalizeNewlines(await buildSchemaSource(expected))
      : undefined;

    if (checkOnly) {
      if (!fs.existsSync(derivedPath)) {
        console.error(
          `Derived pure helper missing: ${mod.derived}\n` +
            'Run: node scripts/generate-cli-pure.mjs'
        );
        failed = true;
        continue;
      }
      const actual = normalizeNewlines(fs.readFileSync(derivedPath, 'utf8'));
      if (actual !== expected) {
        console.error(
          `${mod.derived} is out of date with ${mod.canonical}.\n` +
            'Regenerate: node scripts/generate-cli-pure.mjs\n' +
            '(or: npm run generate:cli-pure)'
        );
        failed = true;
      } else {
        console.log(`✔ ${mod.derived} is up to date (${mod.label}).`);
      }
      if (mod.schemaDerived && expectedSchema !== undefined) {
        const schemaPath = path.join(root, mod.schemaDerived);
        if (!fs.existsSync(schemaPath)) {
          console.error(
            `Derived schema missing: ${mod.schemaDerived}\n` +
              'Run: node scripts/generate-cli-pure.mjs'
          );
          failed = true;
        } else if (
          normalizeNewlines(fs.readFileSync(schemaPath, 'utf8')) !== expectedSchema
        ) {
          console.error(
            `${mod.schemaDerived} is out of date with ${mod.canonical}.\n` +
              'Regenerate: node scripts/generate-cli-pure.mjs'
          );
          failed = true;
        } else {
          console.log(`✔ ${mod.schemaDerived} is up to date (${mod.label}).`);
        }
      }
      continue;
    }

    fs.mkdirSync(path.dirname(derivedPath), { recursive: true });
    fs.writeFileSync(derivedPath, expected, 'utf8');
    console.log(`Wrote ${mod.derived} from ${mod.canonical}`);
    if (mod.schemaDerived && expectedSchema !== undefined) {
      const schemaPath = path.join(root, mod.schemaDerived);
      fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
      fs.writeFileSync(schemaPath, expectedSchema, 'utf8');
      console.log(`Wrote ${mod.schemaDerived} from ${mod.canonical}`);
    }
  }

  if (checkOnly && failed) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
