#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_RULES = [
  { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
  { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
  { from: 'DomainModel', to: 'IntegrationAdapters', allowed: false },
  { from: 'DomainModel', to: 'WorkflowSagaEngine', allowed: false },
  { from: 'DomainModel', to: 'BackgroundJobsScheduling', allowed: false },
  { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
  { from: 'DomainModel', to: 'ReportingReadModels', allowed: false },
  { from: 'DomainModel', to: 'SecurityAuditObservability', allowed: false },
  { from: 'PersistenceAdapters', to: 'ApplicationOrchestration', allowed: false },
  { from: 'PersistenceAdapters', to: 'DomainModel', allowed: false },
  { from: 'IntegrationAdapters', to: 'ApplicationOrchestration', allowed: false },
  { from: 'IntegrationAdapters', to: 'DomainModel', allowed: false },
  { from: 'PresentationAdapters', to: 'PersistenceAdapters', allowed: false },
  { from: 'ReportingReadModels', to: 'PersistenceAdapters', allowed: false },
];

const DEFAULT_INTENT_PREFIXES = [
  { layer: 'DomainModel', prefixes: ['Domain.'] },
  { layer: 'ApplicationOrchestration', prefixes: ['Application.'] },
  { layer: 'PersistenceAdapters', prefixes: ['Adapter.Persistence.', 'Adapter.Repository.'] },
  { layer: 'IntegrationAdapters', prefixes: ['Adapter.Integration.', 'Adapter.External.'] },
  { layer: 'WorkflowSagaEngine', prefixes: ['Workflow.'] },
  { layer: 'BackgroundJobsScheduling', prefixes: ['Job.'] },
  { layer: 'PresentationAdapters', prefixes: ['Presentation.', 'Adapter.Presentation.', 'Adapter.Api.'] },
  { layer: 'ReportingReadModels', prefixes: ['Reporting.'] },
  { layer: 'ExtensibilityMetadata', prefixes: ['Metadata.'] },
  { layer: 'SecurityAuditObservability', prefixes: ['Security.', 'Audit.', 'Observability.'] },
  { layer: 'Kernel', prefixes: ['Kernel.'] },
];

function parseArgs(argv) {
  const args = { root: process.cwd(), config: 'ark.config.json', tsconfig: undefined, json: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--root') args.root = path.resolve(argv[++i]);
    else if (arg === '--config') args.config = argv[++i];
    else if (arg === '--tsconfig') args.tsconfig = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

function usage() {
  return [
    'Usage: ark-check --root <project> --config <ark.config.json> [--tsconfig <tsconfig.json>] [--json]',
    '',
    'Resolves relative, tsconfig path-alias, and package imports via the TypeScript',
    'module resolver, then checks each resolved cross-layer import against the rules.',
    'If no tsconfig is found, path aliases are unavailable but relative/package imports',
    'still resolve.',
    '',
    'Config shape:',
    '{',
    '  "include": ["src"],',
    '  "layers": [',
    '    { "name": "DomainModel", "patterns": ["src/domain/**"], "intentPrefixes": ["Domain."] }',
    '  ],',
    '  "rules": [{ "from": "DomainModel", "to": "PersistenceAdapters", "allowed": false }]',
    '}',
  ].join('\n');
}

function readConfig(root, configPath) {
  const fullPath = path.isAbsolute(configPath)
    ? configPath
    : path.join(root, configPath);
  if (!fs.existsSync(fullPath)) {
    return {
      include: ['src'],
      layers: [],
      rules: DEFAULT_RULES,
    };
  }
  const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  return {
    include: raw.include ?? ['src'],
    layers: raw.layers ?? [],
    rules: raw.rules ?? DEFAULT_RULES,
  };
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, files);
    } else if (/\.[cm]?[tj]sx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

function normalize(value) {
  return value.split(path.sep).join('/');
}

function patternToRegExp(pattern) {
  const escaped = normalize(pattern)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}

function layerForFile(root, file, layers) {
  const rel = normalize(path.relative(root, file));
  for (const layer of layers) {
    for (const pattern of layer.patterns ?? []) {
      if (patternToRegExp(pattern).test(rel)) return layer.name;
    }
  }
  return undefined;
}

function layerForIntent(intent, layers) {
  const configured = layers
    .flatMap((layer) =>
      (layer.intentPrefixes ?? []).map((prefix) => ({ layer: layer.name, prefix }))
    );
  const candidates = configured.length > 0 ? configured : DEFAULT_INTENT_PREFIXES;
  return candidates.find((item) => intent.startsWith(item.prefix))?.layer;
}

function isBlocked(rules, from, to) {
  return rules.find((rule) => !rule.allowed && rule.from === from && rule.to === to);
}

function createModuleResolutionHost(ts) {
  return {
    fileExists: (f) => ts.sys.fileExists(f),
    readFile: (f) => ts.sys.readFile(f),
    directoryExists: ts.sys.directoryExists ? (d) => ts.sys.directoryExists(d) : undefined,
    getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
    getDirectories: ts.sys.getDirectories ? (d) => ts.sys.getDirectories(d) : undefined,
    realpath: ts.sys.realpath ? (p) => ts.sys.realpath(p) : undefined,
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
  };
}

function loadCompilerOptions(ts, root, tsconfigArg) {
  const configPath = tsconfigArg
    ? path.isAbsolute(tsconfigArg)
      ? tsconfigArg
      : path.join(root, tsconfigArg)
    : ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath || !fs.existsSync(configPath)) return {};
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) return {};
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath));
  return parsed.options;
}

/**
 * Resolve any import specifier (relative, tsconfig path-alias, or package) to an
 * in-project source file using TypeScript's module resolver. Returns undefined for
 * unresolved, external (node_modules), declaration-only, or out-of-root targets.
 */
function resolveImport(ts, specifier, containingFile, options, host, root) {
  const res = ts.resolveModuleName(specifier, containingFile, options, host);
  const file = res.resolvedModule?.resolvedFileName;
  if (!file) return undefined;
  const abs = path.resolve(file);
  if (abs.includes(`${path.sep}node_modules${path.sep}`)) return undefined;
  if (abs.endsWith('.d.ts')) return undefined;
  const absRoot = path.resolve(root);
  if (abs !== absRoot && !abs.startsWith(absRoot + path.sep)) return undefined;
  return abs;
}

function lineOf(sourceFile, pos) {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function textOfModuleSpecifier(node) {
  return node.moduleSpecifier && typeof node.moduleSpecifier.text === 'string'
    ? node.moduleSpecifier.text
    : undefined;
}

function looksLikeIntent(value) {
  return /^(Domain|Application|Adapter|Workflow|Job|Presentation|Reporting|Metadata|Security|Audit|Observability|Kernel)\.[A-Za-z0-9_.]+$/.test(value);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  let ts;
  try {
    ts = await import('typescript');
  } catch {
    console.error('ark-check requires TypeScript. Install it with: npm install -D typescript');
    process.exitCode = 2;
    return;
  }

  const root = args.root;
  const config = readConfig(root, args.config);
  const compilerOptions = loadCompilerOptions(ts, root, args.tsconfig);
  const moduleHost = createModuleResolutionHost(ts);
  const files = config.include.flatMap((entry) => walk(path.join(root, entry)));
  const violations = [];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const sourceLayer = layerForFile(root, file, config.layers);
    if (!sourceLayer) continue;

    const visit = (node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const specifier = textOfModuleSpecifier(node);
        if (specifier) {
          const target = resolveImport(ts, specifier, file, compilerOptions, moduleHost, root);
          const targetLayer = target ? layerForFile(root, target, config.layers) : undefined;
          const rule = targetLayer ? isBlocked(config.rules, sourceLayer, targetLayer) : undefined;
          if (rule) {
            violations.push({
              ruleId: 'LAYER_IMPORT_VIOLATION',
              file: normalize(path.relative(root, file)),
              line: lineOf(sourceFile, node.getStart(sourceFile)),
              fromLayer: sourceLayer,
              toLayer: targetLayer,
              target: normalize(path.relative(root, target)),
              message:
                rule.message ??
                `${sourceLayer} must not import ${targetLayer}.`,
            });
          }
        }
      }

      if (ts.isStringLiteralLike(node) && looksLikeIntent(node.text)) {
        const targetLayer = layerForIntent(node.text, config.layers);
        const rule = targetLayer ? isBlocked(config.rules, sourceLayer, targetLayer) : undefined;
        if (rule) {
          violations.push({
            ruleId: 'LAYER_INTENT_REFERENCE_VIOLATION',
            file: normalize(path.relative(root, file)),
            line: lineOf(sourceFile, node.getStart(sourceFile)),
            fromLayer: sourceLayer,
            toLayer: targetLayer,
            target: node.text,
            message:
              rule.message ??
              `${sourceLayer} must not reference ${targetLayer} intent ${node.text}.`,
          });
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  if (args.json) {
    console.log(JSON.stringify({ ok: violations.length === 0, violations }, null, 2));
  } else if (violations.length === 0) {
    console.log('Ark check passed.');
  } else {
    for (const violation of violations) {
      console.error(
        `${violation.file}:${violation.line} ${violation.ruleId} ${violation.message}`
      );
    }
  }

  process.exitCode = violations.length === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
