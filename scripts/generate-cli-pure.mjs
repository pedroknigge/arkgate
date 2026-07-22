#!/usr/bin/env node
/**
 * R4 — emit pure CLI helpers from Domain TypeScript sources.
 *
 * Canonical → derived (committed for zero-build CLI on npm):
 *   src/domain/remediation.ts  → bin/lib/remediation.mjs
 *   src/domain/baselineKey.ts  → bin/lib/baseline-key.mjs
 *   src/domain/configContract.ts → bin/lib/config-contract.mjs
 *                                → schemas/ark.config.schema.json
 *   src/domain/adapterContract.ts → bin/lib/adapter-contract.mjs
 *                                 → schemas/ark.analysis-result.schema.json
 *   src/domain/resolvedCandidateFactsSchema.ts → schemas/ark.resolved-candidate-facts.schema.json
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
    schemaExport: 'ARK_CONFIG_SCHEMA',
    label: 'versioned ark.config.json contract + schema',
  },
  {
    canonical: 'src/domain/adapterContract.ts',
    derived: 'bin/lib/adapter-contract.mjs',
    schemaDerived: 'schemas/ark.analysis-result.schema.json',
    schemaExport: 'ARK_ANALYSIS_RESULT_SCHEMA',
    label: 'versioned cross-adapter analysis result contract + schema',
  },
  {
    canonical: 'src/domain/sourcePolicy.ts',
    derived: 'bin/lib/source-policy.mjs',
    label: 'shared source-policy classification',
  },
  {
    canonical: 'src/domain/resolvedCandidateFactsSchema.ts',
    schemaDerived: 'schemas/ark.resolved-candidate-facts.schema.json',
    schemaExport: 'RESOLVED_CANDIDATE_FACTS_SCHEMA',
    compactSchema: true,
    label: 'versioned resolved candidate facts contract + schema',
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

function transpileCanonicalSource(canonicalRel, canonicalTs) {
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

  return stripLeadingBlockComment(outputText).trimEnd() + '\n';
}

function buildDerivedSource(canonicalRel, derivedRel, transpiledSource) {
  return `${banner(canonicalRel, derivedRel)}\n${transpiledSource}`;
}

function normalizeNewlines(s) {
  return s.replace(/\r\n/g, '\n');
}

async function buildSchemaSource(derivedSource, schemaExport, compact = false) {
  const url = `data:text/javascript;base64,${Buffer.from(derivedSource).toString('base64')}`;
  const module = await import(url);
  if (!module[schemaExport] || typeof module[schemaExport] !== 'object') {
    throw new Error(`canonical module must export ${schemaExport}`);
  }
  return `${JSON.stringify(module[schemaExport], null, compact ? undefined : 2)}\n`;
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  let failed = false;

  for (const mod of MODULES) {
    const canonicalPath = path.join(root, mod.canonical);
    if (!fs.existsSync(canonicalPath)) {
      console.error(`Missing canonical source: ${mod.canonical}`);
      process.exit(2);
    }
    const canonicalTs = fs.readFileSync(canonicalPath, 'utf8');
    const transpiled = normalizeNewlines(transpileCanonicalSource(mod.canonical, canonicalTs));
    const expected = mod.derived
      ? normalizeNewlines(buildDerivedSource(mod.canonical, mod.derived, transpiled))
      : undefined;
    const expectedSchema = mod.schemaDerived
      ? normalizeNewlines(
          await buildSchemaSource(transpiled, mod.schemaExport, mod.compactSchema)
        )
      : undefined;

    if (checkOnly) {
      if (mod.derived && expected !== undefined) {
        const derivedPath = path.join(root, mod.derived);
        if (!fs.existsSync(derivedPath)) {
          console.error(
            `Derived pure helper missing: ${mod.derived}\n` +
              'Run: node scripts/generate-cli-pure.mjs'
          );
          failed = true;
        } else {
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
        }
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

    if (mod.derived && expected !== undefined) {
      const derivedPath = path.join(root, mod.derived);
      fs.mkdirSync(path.dirname(derivedPath), { recursive: true });
      fs.writeFileSync(derivedPath, expected, 'utf8');
      console.log(`Wrote ${mod.derived} from ${mod.canonical}`);
    }
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
