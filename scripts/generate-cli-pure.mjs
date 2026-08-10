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
 *   src/domain/projectIdentity.ts → bin/lib/project-identity.mjs
 *                                 → schemas/ark.project-identity.schema.json
 *   src/domain/statusManifest.ts  → bin/lib/status-manifest.mjs
 *                                 → schemas/ark.status-manifest.schema.json
 *   src/domain/improvementCompassTypes.ts → bin/lib/improvement-compass-types.mjs
 *   src/domain/improvementCompassMap.ts   → bin/lib/improvement-compass-map.mjs
 *   src/domain/improvementCompass.ts      → bin/lib/improvement-compass.mjs
 *   src/domain/agentProjection.ts → bin/lib/agent-projection.mjs
 *   src/domain/agentSkillsPackage.ts → bin/lib/agent-skills-package.mjs
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
    canonical: 'src/domain/diagnosticCatalog.ts',
    derived: 'bin/lib/diagnostic-catalog.mjs',
    label: 'public diagnostic code catalog (ACS02)',
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
    canonical: 'src/domain/arkRulesContract.ts',
    derived: 'bin/lib/arkrules-contract.mjs',
    schemaDerived: 'schemas/ark.arkrules.schema.json',
    schemaExport: 'ARK_RULES_SCHEMA',
    label: 'versioned ArkRules (intra-layer) contract + schema',
  },
  {
    canonical: 'src/domain/invariantCoverage.ts',
    derived: 'bin/lib/invariant-coverage.mjs',
    label: 'invariant coverage evidence (ADR 0014)',
  },
  {
    canonical: 'src/domain/rulesInventory.ts',
    derived: 'bin/lib/rules-inventory.mjs',
    label: 'brownfield rules inventory (AR13)',
  },
  {
    canonical: 'src/domain/arkRuleSensors.ts',
    derived: 'bin/lib/arkrules-sensors.mjs',
    label: 'ArkRules structure sensors (ADR 0013)',
  },
  {
    canonical: 'src/domain/adapterContract.ts',
    derived: 'bin/lib/adapter-contract.mjs',
    schemaDerived: 'schemas/ark.analysis-result.schema.json',
    schemaExport: 'ARK_ANALYSIS_RESULT_SCHEMA',
    label: 'versioned cross-adapter analysis result contract + schema',
  },
  {
    canonical: 'src/domain/projectIdentity.ts',
    derived: 'bin/lib/project-identity.mjs',
    schemaDerived: 'schemas/ark.project-identity.schema.json',
    schemaExport: 'ARK_PROJECT_IDENTITY_SCHEMA',
    label: 'versioned MCP project identity + binding contract',
  },
  {
    canonical: 'src/domain/statusManifest.ts',
    derived: 'bin/lib/status-manifest.mjs',
    schemaDerived: 'schemas/ark.status-manifest.schema.json',
    schemaExport: 'ARK_STATUS_MANIFEST_SCHEMA',
    label: 'unified status manifest (ACS03)',
  },
  // DF03: compass split — types + mappers + facade (import rewrite to sibling .mjs).
  {
    canonical: 'src/domain/improvementCompassTypes.ts',
    derived: 'bin/lib/improvement-compass-types.mjs',
    label: 'improvement compass types/constants (notAScore vocabulary)',
  },
  {
    canonical: 'src/domain/improvementCompassMap.ts',
    derived: 'bin/lib/improvement-compass-map.mjs',
    label: 'improvement compass fact→lens mappers',
  },
  {
    canonical: 'src/domain/improvementCompass.ts',
    derived: 'bin/lib/improvement-compass.mjs',
    label: 'improvement compass build + doctor formatters (notAScore projection)',
  },
  {
    canonical: 'src/domain/agentProjection.ts',
    derived: 'bin/lib/agent-projection.mjs',
    label: 'version-matched agent contract projection (ACS04)',
  },
  {
    canonical: 'src/domain/agentSkillsPackage.ts',
    derived: 'bin/lib/agent-skills-package.mjs',
    label: 'Agent Skills packaging contract (ACS05)',
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

/**
 * Map Domain TS basenames (no extension) → derived bin/lib basename for
 * multi-file pure modules (e.g. improvementCompass → improvement-compass.mjs).
 */
function buildCanonicalImportRewriteMap() {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const mod of MODULES) {
    if (!mod.derived) continue;
    const base = path.basename(mod.canonical, path.extname(mod.canonical));
    map.set(base, path.basename(mod.derived));
  }
  return map;
}

/**
 * Rewrite relative Domain imports to sibling generated .mjs paths so the
 * zero-build CLI can resolve multi-file pure modules without a bundler.
 */
function rewriteRelativeDomainImports(transpiledSource, importRewriteMap) {
  return transpiledSource.replace(
    /(from\s+['"])(\.\/[^'"]+)(['"])/g,
    (full, pre, spec, post) => {
      const bare = spec
        .replace(/^\.\//, '')
        .replace(/\.js$/i, '')
        .replace(/\.ts$/i, '')
        .replace(/\.mjs$/i, '');
      const derivedBase = importRewriteMap.get(bare);
      if (!derivedBase) return full;
      return `${pre}./${derivedBase}${post}`;
    }
  );
}

function transpileCanonicalSource(canonicalRel, canonicalTs, importRewriteMap) {
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

  const stripped = stripLeadingBlockComment(outputText).trimEnd() + '\n';
  return rewriteRelativeDomainImports(stripped, importRewriteMap);
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
  const importRewriteMap = buildCanonicalImportRewriteMap();

  for (const mod of MODULES) {
    const canonicalPath = path.join(root, mod.canonical);
    if (!fs.existsSync(canonicalPath)) {
      console.error(`Missing canonical source: ${mod.canonical}`);
      process.exit(2);
    }
    const canonicalTs = fs.readFileSync(canonicalPath, 'utf8');
    const transpiled = normalizeNewlines(
      transpileCanonicalSource(mod.canonical, canonicalTs, importRewriteMap)
    );
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
