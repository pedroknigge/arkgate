/**
 * The single shipped TypeScript/filesystem resolver for ADR 0011 facts.
 *
 * This Tooling adapter owns discovery, nearest-tsconfig lookup, package/symlink
 * resolution, and complete in-memory source overlays. It never classifies a
 * layer or decides a rule; the generated Kernel bundle owns that verdict.
 */
import fs from 'node:fs';
import path from 'node:path';

import { isScanExcludedRelative } from '../ark-shared.mjs';
import {
  AMBIENT_CAPABILITY_ENTRIES,
  collectCapabilityUses,
  collectForbiddenCapabilityUses,
  createTrustedResolvedCandidateFacts,
  deterministicHash,
  extractSemanticDependencies,
  looksLikeArkIntent,
  resolvedFactsEvidenceRequirementsHash,
  stableSerialize,
} from './analysis-engine.mjs';
import {
  isArkPublishCandidate,
  isPublishCall,
  lineOf,
  namedModuleBindings,
  objectHasProperty,
  publishHasSource,
  publishSourceLiteral,
  sourceFileExportsOnlyTypes,
  sourceFileHasTopLevelSideEffects,
  stringLiteralText,
  typeOnlyExportNames,
} from './ast-scan.mjs';
import { provePortProofInject } from './port-proof.mjs';
import {
  collectGovernedFiles,
  isGovernableSourceFile,
  normalize,
} from './scan-files.mjs';

export const RESOLVED_FACTS_RESOLVER_IDENTITY = 'arkgate-typescript-resolver@1';

const IN_MEMORY_STORES = new Set([
  'InMemoryAuditStore',
  'InMemoryOutboxStore',
  'InMemoryReadModelStore',
  'InMemoryWorkflowStore',
]);

const IN_MEMORY_DEFAULT_FACTORIES = new Map([
  ['createArkKernel', ['outbox', 'auditTrail', 'projections']],
  ['createAuditTrail', ['store']],
  ['createProjectionRegistry', ['store']],
  ['createWorkflowEngine', ['store']],
]);

function canonicalProjectPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error('Every candidate path must be a non-empty project-relative path.');
  }
  const portable = value.replace(/\\/g, '/');
  if (portable.startsWith('/') || /^[A-Za-z]:\//.test(portable)) {
    throw new Error(`Candidate path must be project-relative: ${value}`);
  }
  const normalized = path.posix.normalize(portable);
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized !== portable
  ) {
    throw new Error(`Candidate path must be canonical: ${value}`);
  }
  return normalized;
}

function isInsideRoot(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function isIncluded(relativePath, include) {
  return (include ?? []).some((entry) => {
    const includeRoot = String(entry)
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/\/$/, '');
    return (
      includeRoot === '.' ||
      relativePath === includeRoot ||
      relativePath.startsWith(`${includeRoot}/`)
    );
  });
}

function observeResolvedInput(observeInput, inputPath, kind) {
  if (typeof inputPath === 'string') observeInput?.(path.resolve(inputPath), kind);
}

function readPackageName(root, observeInput) {
  const packagePath = path.join(root, 'package.json');
  observeResolvedInput(observeInput, packagePath, 'package');
  try {
    const parsed = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return typeof parsed?.name === 'string' && parsed.name.length > 0 ? parsed.name : undefined;
  } catch {
    return undefined;
  }
}

function rememberCanonicalAlias(aliases, real, relative, absolute) {
  const current = aliases.get(real);
  if (!current || relative < current.relative) {
    aliases.set(real, { relative, absolute: path.resolve(absolute) });
  }
}

function rememberDirectoryAlias(aliases, real, relative, absolute) {
  const current = aliases.get(real) ?? new Map();
  if (!current.has(relative)) current.set(relative, { relative, absolute: path.resolve(absolute) });
  aliases.set(real, current);
}

function potentialRealpath(root, absolute, observeInput) {
  const suffix = [];
  let existing = path.resolve(absolute);
  while (true) {
    observeResolvedInput(observeInput, existing, 'exists');
    if (fs.existsSync(existing)) break;
    const parent = path.dirname(existing);
    if (parent === existing) return undefined;
    suffix.unshift(path.basename(existing));
    existing = parent;
  }
  observeResolvedInput(observeInput, existing, 'realpath');
  const real = path.join(fs.realpathSync(existing), ...suffix);
  if (!isInsideRoot(root, real)) {
    throw new Error(`Refusing candidate overlay through a symlink outside project root.`);
  }
  return path.resolve(real);
}

/** Lexical + potential-realpath identities for resolver inputs inside one project root. */
export function resolvedInputIdentities(root, inputs) {
  const lexicalRoot = path.resolve(root);
  const realRoot = fs.realpathSync(lexicalRoot);
  const identities = new Set();
  for (const input of inputs) {
    if (typeof input !== 'string' || input.length === 0) continue;
    const absolute = path.isAbsolute(input) ? path.resolve(input) : path.resolve(lexicalRoot, input);
    if (!isInsideRoot(lexicalRoot, absolute)) {
      throw new Error(`Resolved-analysis input is outside project root: ${input}`);
    }
    identities.add(`path:${normalize(path.relative(lexicalRoot, absolute))}`);
    const real = potentialRealpath(realRoot, absolute);
    if (real) identities.add(`real:${normalize(path.relative(realRoot, real))}`);
  }
  return identities;
}

function canonicalOverlayPath(
  root,
  requested,
  fileAliases,
  directoryAliases,
  config,
  observeInput
) {
  const absolute = path.join(root, ...requested.split('/'));
  const real = potentialRealpath(root, absolute, observeInput);
  if (!real) return requested;
  const fileAlias = fileAliases.get(real);
  if (fileAlias) return fileAlias.relative;

  const candidates = new Set();
  const rememberCandidate = (relative) => {
    if (isIncluded(relative, config.include) && !isScanExcludedRelative(relative, config)) {
      candidates.add(relative);
    }
  };
  rememberCandidate(requested);
  rememberCandidate(canonicalProjectPath(normalize(path.relative(root, real))));
  const suffix = [path.basename(real)];
  let directory = path.dirname(real);
  while (isInsideRoot(root, directory)) {
    for (const alias of directoryAliases.get(directory)?.values() ?? []) {
      rememberCandidate(canonicalProjectPath([alias.relative, ...suffix].filter(Boolean).join('/')));
    }
    if (directory === root) break;
    suffix.unshift(path.basename(directory));
    directory = path.dirname(directory);
  }
  return [...candidates].sort()[0] ?? requested;
}

function collectCandidateFiles(root, config, changes, observeInput) {
  const files = new Map();
  const directoryAliases = new Map();
  const expandedAliasDirectories = new Set();
  const discovered = (config.include ?? [])
    .flatMap((entry) =>
      collectGovernedFiles(root, { ...config, include: [entry] }, {
        observeInput,
        onDirectory(absolute, real) {
          let relative = normalize(path.relative(root, absolute));
          if (relative === '.') relative = '';
          rememberDirectoryAlias(directoryAliases, real, relative, absolute);
        },
      })
    )
    .map((absolute) => {
      observeResolvedInput(observeInput, absolute, 'realpath');
      return {
        absolute,
        real: fs.realpathSync(absolute),
        relative: canonicalProjectPath(normalize(path.relative(root, absolute))),
      };
    })
    .sort((left, right) =>
      left.relative < right.relative ? -1 : left.relative > right.relative ? 1 : 0
    );
  const canonicalByRealpath = new Map();
  for (const candidate of discovered) {
    if (!canonicalByRealpath.has(candidate.real)) canonicalByRealpath.set(candidate.real, candidate);
  }
  const fileAliases = new Map();
  for (const candidate of discovered) {
    const canonical = canonicalByRealpath.get(candidate.real);
    rememberCanonicalAlias(
      fileAliases,
      candidate.real,
      canonical.relative,
      canonical.absolute
    );
    let absoluteDirectory = path.dirname(candidate.absolute);
    let relativeDirectory = path.posix.dirname(candidate.relative);
    if (relativeDirectory === '.') relativeDirectory = '';
    while (isInsideRoot(root, absoluteDirectory)) {
      if (expandedAliasDirectories.has(absoluteDirectory)) break;
      expandedAliasDirectories.add(absoluteDirectory);
      observeResolvedInput(observeInput, absoluteDirectory, 'realpath');
      const realDirectory = fs.realpathSync(absoluteDirectory);
      rememberDirectoryAlias(
        directoryAliases,
        realDirectory,
        relativeDirectory,
        absoluteDirectory
      );
      if (absoluteDirectory === root) break;
      absoluteDirectory = path.dirname(absoluteDirectory);
      relativeDirectory = path.posix.dirname(relativeDirectory);
      if (relativeDirectory === '.') relativeDirectory = '';
    }
  }
  for (const { absolute, real, relative } of canonicalByRealpath.values()) {
    observeResolvedInput(observeInput, absolute, 'source');
    files.set(relative, {
      path: relative,
      absolute: path.resolve(absolute),
      real: path.resolve(real),
      content: fs.readFileSync(absolute, 'utf8'),
    });
  }

  const changed = new Set();
  const canonicalChanges = [];
  for (const change of changes ?? []) {
    const requested = canonicalProjectPath(change?.path);
    const relative = canonicalOverlayPath(
      root,
      requested,
      fileAliases,
      directoryAliases,
      config,
      observeInput
    );
    if (changed.has(relative)) {
      throw new Error(`Atomic candidate overlay contains duplicate path ${relative}.`);
    }
    changed.add(relative);
    if (change?.delete === true && change.content === undefined) {
      files.delete(relative);
      canonicalChanges.push({ path: relative, requestedPath: requested, delete: true });
      continue;
    }
    if (typeof change?.content !== 'string' || change.delete !== undefined) {
      throw new Error(`Candidate overlay for ${relative} requires content or delete: true.`);
    }
    canonicalChanges.push({ path: relative, requestedPath: requested, content: change.content });
    if (!isGovernableSourceFile(path.basename(relative))) {
      continue;
    }
    if (!isIncluded(relative, config.include) || isScanExcludedRelative(relative, config)) {
      continue;
    }
    files.set(relative, {
      path: relative,
      absolute: path.join(root, ...relative.split('/')),
      content: change.content,
    });
  }

  return {
    files: [...files.values()].sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0
    ),
    changes: canonicalChanges,
  };
}

/** Canonicalize a Tooling overlay without exposing filesystem identity to Kernel. */
export function canonicalizeCandidateChanges({ root, config, changes = [] }) {
  const canonicalRoot = fs.realpathSync(root);
  return collectCandidateFiles(canonicalRoot, config, changes).changes.map((change) =>
    change.delete === true
      ? { path: change.path, delete: true }
      : { path: change.path, content: change.content }
  );
}

function tryRealpath(value, observeInput) {
  observeResolvedInput(observeInput, value, 'realpath');
  try {
    return fs.realpathSync(value);
  } catch {
    return undefined;
  }
}

function createOverlayModuleHost(ts, root, files, changes, observeInput) {
  const sys = ts.sys;
  const byAbsolute = new Map();
  const pathByAbsolute = new Map();
  const deleted = new Set();
  const virtualDirectories = new Set([root]);

  const rememberVirtualDirectories = (absolute) => {
    let directory = path.dirname(absolute);
    while (isInsideRoot(root, directory)) {
      virtualDirectories.add(path.resolve(directory));
      if (path.resolve(directory) === root) break;
      directory = path.dirname(directory);
    }
  };
  const remember = (absolute, file) => {
    const key = path.resolve(absolute);
    byAbsolute.set(key, file);
    pathByAbsolute.set(key, file.path);
    rememberVirtualDirectories(key);
  };
  for (const file of files) {
    remember(file.absolute, file);
    const real = file.real ?? tryRealpath(file.absolute, observeInput);
    if (real && isInsideRoot(root, real)) remember(real, file);
  }
  const candidateByPath = new Map(files.map((file) => [file.path, file]));
  for (const change of changes ?? []) {
    const aliases = new Set([change.path, change.requestedPath].filter(Boolean));
    const candidate =
      candidateByPath.get(change.path) ??
      (typeof change.content === 'string'
        ? {
            path: change.path,
            absolute: path.join(root, ...change.path.split('/')),
            content: change.content,
          }
        : undefined);
    for (const alias of aliases) {
      const absolute = path.join(root, ...canonicalProjectPath(alias).split('/'));
      if (change?.delete === true) {
        deleted.add(path.resolve(absolute));
        const real = tryRealpath(absolute, observeInput);
        if (real && isInsideRoot(root, real)) deleted.add(path.resolve(real));
      } else if (candidate) {
        remember(absolute, candidate);
      }
    }
  }

  const fileExists = (fileName) => {
    const absolute = path.resolve(fileName);
    observeResolvedInput(observeInput, absolute, 'module-file');
    if (deleted.has(absolute)) return false;
    if (byAbsolute.has(absolute)) return true;
    return sys?.fileExists ? sys.fileExists(fileName) : fs.existsSync(fileName);
  };
  const readFile = (fileName) => {
    const absolute = path.resolve(fileName);
    observeResolvedInput(observeInput, absolute, 'module-read');
    if (deleted.has(absolute)) return undefined;
    const candidate = byAbsolute.get(absolute);
    if (candidate) return candidate.content;
    if (sys?.readFile) return sys.readFile(fileName);
    try {
      return fs.readFileSync(fileName, 'utf8');
    } catch {
      return undefined;
    }
  };
  const directoryExists = (directory) => {
    const absolute = path.resolve(directory);
    observeResolvedInput(observeInput, absolute, 'module-directory');
    if (virtualDirectories.has(absolute)) return true;
    if (sys?.directoryExists) return sys.directoryExists(directory);
    try {
      return fs.statSync(directory).isDirectory();
    } catch {
      return false;
    }
  };
  const getDirectories = (directory) => {
    const absolute = path.resolve(directory);
    observeResolvedInput(observeInput, absolute, 'module-directory');
    const names = new Set();
    if (sys?.getDirectories) {
      for (const item of sys.getDirectories(directory)) names.add(path.basename(item));
    } else {
      try {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          if (entry.isDirectory()) names.add(entry.name);
        }
      } catch {
        // A purely virtual directory has no disk entries.
      }
    }
    for (const virtual of virtualDirectories) {
      if (path.dirname(virtual) === absolute) names.add(path.basename(virtual));
    }
    return [...names].sort();
  };
  const realpath = (fileName) => {
    const absolute = path.resolve(fileName);
    observeResolvedInput(observeInput, absolute, 'module-realpath');
    if (deleted.has(absolute)) return absolute;
    const candidate = byAbsolute.get(absolute);
    if (candidate) {
      const real = candidate.real ?? tryRealpath(candidate.absolute, observeInput);
      return real && isInsideRoot(root, real) ? real : candidate.absolute;
    }
    if (sys?.realpath) return sys.realpath(fileName);
    return tryRealpath(fileName) ?? absolute;
  };

  return {
    fileExists,
    readFile,
    directoryExists,
    getCurrentDirectory: () => root,
    getDirectories,
    realpath,
    useCaseSensitiveFileNames: sys?.useCaseSensitiveFileNames ?? true,
    candidatePath(fileName) {
      const absolute = path.resolve(fileName);
      const direct = pathByAbsolute.get(absolute);
      if (direct) return direct;
      const real = realpath(absolute);
      const candidate = pathByAbsolute.get(path.resolve(real));
      if (candidate) return candidate;
      if (!isInsideRoot(root, real)) return undefined;
      const relative = normalize(path.relative(root, real));
      if (
        relative.split('/').includes('node_modules') ||
        !/\.[cm]?[tj]sx?$/.test(relative) ||
        relative.endsWith('.d.ts')
      ) {
        return undefined;
      }
      return canonicalProjectPath(relative);
    },
  };
}

function nearestTsconfig(root, fileName, cache, observeInput) {
  const initial = path.dirname(fileName);
  if (cache.has(initial)) return cache.get(initial);
  let directory = initial;
  while (isInsideRoot(root, directory)) {
    const candidate = path.join(directory, 'tsconfig.json');
    observeResolvedInput(observeInput, candidate, 'exists');
    if (fs.existsSync(candidate)) {
      const resolved = path.resolve(candidate);
      cache.set(initial, resolved);
      return resolved;
    }
    if (directory === root) break;
    directory = path.dirname(directory);
  }
  cache.set(initial, undefined);
  return undefined;
}

function configLabel(root, configPath, externalAnchor) {
  if (isInsideRoot(root, configPath)) return normalize(path.relative(root, configPath));
  if (externalAnchor && isInsideRoot(externalAnchor, configPath)) {
    return `<external-tsconfig>/${normalize(path.relative(externalAnchor, configPath))}`;
  }
  return `<external-config>/${path.basename(configPath)}`;
}

function configReasonFile(root, configPath) {
  return isInsideRoot(root, configPath)
    ? canonicalProjectPath(normalize(path.relative(root, configPath)))
    : undefined;
}

function portableCompilerValue(root, value, externalAnchor) {
  if (typeof value === 'string') {
    if (!path.isAbsolute(value)) return value.replace(/\\/g, '/');
    const absolute = path.resolve(value);
    if (isInsideRoot(root, absolute)) {
      return `<root>/${normalize(path.relative(root, absolute))}`.replace(/\/$/, '');
    }
    if (externalAnchor && isInsideRoot(externalAnchor, absolute)) {
      return `<external-tsconfig>/${normalize(path.relative(externalAnchor, absolute))}`.replace(
        /\/$/,
        ''
      );
    }
    return `<external>/${path.basename(absolute)}`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => portableCompilerValue(root, item, externalAnchor));
  }
  if (!value || typeof value !== 'object') return value;
  const portable = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined && typeof item !== 'function') {
      portable[key] = portableCompilerValue(root, item, externalAnchor);
    }
  }
  return portable;
}

function compilerContext(ts, root, tsconfig, candidateFiles, observeInput) {
  const explicitPath = tsconfig
    ? path.isAbsolute(tsconfig)
      ? path.resolve(tsconfig)
      : path.resolve(root, tsconfig)
    : undefined;
  const externalAnchor =
    explicitPath && !isInsideRoot(root, explicitPath)
      ? path.dirname(explicitPath)
      : undefined;
  const configByFile = new Map();
  const nearestConfigByDirectory = new Map();
  if (explicitPath) {
    for (const file of candidateFiles) configByFile.set(path.resolve(file.absolute), explicitPath);
  } else if (!explicitPath) {
    for (const file of candidateFiles) {
      const nearest = nearestTsconfig(
        root,
        file.absolute,
        nearestConfigByDirectory,
        observeInput
      );
      if (nearest) configByFile.set(path.resolve(file.absolute), nearest);
    }
  }
  const configPaths = [...new Set(configByFile.values())].sort((left, right) => {
    const leftLabel = configLabel(root, left, externalAnchor);
    const rightLabel = configLabel(root, right, externalAnchor);
    return leftLabel < rightLabel ? -1 : leftLabel > rightLabel ? 1 : 0;
  });
  const optionsByPath = new Map();
  const configInputsByPath = new Map();
  const reasons = [];
  for (const configPath of configPaths) {
    const configContents = new Map();
    const readConfig = (fileName) => {
      observeResolvedInput(observeInput, fileName, 'tsconfig');
      try {
        const content = fs.readFileSync(fileName, 'utf8');
        if (/\.jsonc?$/i.test(fileName)) configContents.set(path.resolve(fileName), content);
        return content;
      } catch {
        return undefined;
      }
    };
    const read = ts.readConfigFile(configPath, readConfig);
    const label = configLabel(root, configPath, externalAnchor);
    const reasonFile = configReasonFile(root, configPath);
    if (read.error) {
      reasons.push({
        code: 'TSCONFIG_PARSE_FAILURE',
        ...(reasonFile ? { file: reasonFile } : {}),
        message: `TypeScript could not read ${label}.`,
      });
      optionsByPath.set(configPath, {});
      configInputsByPath.set(configPath, configContents);
      continue;
    }
    const parsed = ts.parseJsonConfigFileContent(
      read.config,
      {
        useCaseSensitiveFileNames: ts.sys?.useCaseSensitiveFileNames ?? true,
        readDirectory(...args) {
          observeResolvedInput(observeInput, args[0], 'tsconfig-directory');
          return ts.sys?.readDirectory ? ts.sys.readDirectory(...args) : [];
        },
        fileExists(fileName) {
          observeResolvedInput(observeInput, fileName, 'tsconfig-exists');
          return ts.sys?.fileExists ? ts.sys.fileExists(fileName) : fs.existsSync(fileName);
        },
        readFile: readConfig,
      },
      path.dirname(configPath),
      undefined,
      configPath
    );
    const optionErrors = (parsed.errors ?? []).filter(
      (diagnostic) => diagnostic?.code !== 18002 && diagnostic?.code !== 18003
    );
    if (optionErrors.length > 0) {
      reasons.push({
        code: 'TSCONFIG_PARSE_FAILURE',
        ...(reasonFile ? { file: reasonFile } : {}),
        message: `${label} has ${optionErrors.length} TypeScript config diagnostic(s).`,
      });
    }
    optionsByPath.set(configPath, parsed.options ?? {});
    configInputsByPath.set(configPath, configContents);
  }

  const optionsFor = (fileName) => {
    const configPath = configByFile.get(path.resolve(fileName));
    return configPath ? optionsByPath.get(configPath) ?? {} : {};
  };
  const configs = configPaths.map((configPath) => ({
    path: configLabel(root, configPath, externalAnchor),
    options: portableCompilerValue(root, optionsByPath.get(configPath) ?? {}, externalAnchor),
  }));
  const configClosure = configPaths.map((configPath) => ({
    top: configLabel(root, configPath, externalAnchor),
    inputs: [...(configInputsByPath.get(configPath) ?? [])]
      .map(([inputPath, content]) => ({
        path: configLabel(root, inputPath, externalAnchor),
        contentHash: deterministicHash(content),
      }))
      .sort((left, right) =>
        left.path < right.path ? -1 : left.path > right.path ? 1 : 0
      ),
  }));
  const configInputPaths = [
    ...new Set(
      [...configInputsByPath.values()].flatMap((inputs) => [...inputs.keys()])
    ),
  ]
    .filter((inputPath) => isInsideRoot(root, inputPath))
    .map((inputPath) => canonicalProjectPath(normalize(path.relative(root, inputPath))))
    .sort();
  return {
    optionsFor,
    reasons,
    configInputPaths,
    tsconfigHash: deterministicHash(stableSerialize(configClosure)),
    compilerOptionsHash: deterministicHash(
      stableSerialize(configs.map(({ path: configPath, options }) => ({ path: configPath, options })))
    ),
  };
}

/** Project-relative TypeScript config closure read by the shipped resolver. */
export function resolvedCompilerInputPaths({
  root,
  config,
  ts,
  tsconfig,
  changes = [],
  observeInput,
}) {
  if (!ts?.readConfigFile || !ts?.parseJsonConfigFileContent) return [];
  observeResolvedInput(observeInput, root, 'realpath');
  const canonicalRoot = fs.realpathSync(root);
  const candidate = collectCandidateFiles(canonicalRoot, config, changes, observeInput);
  return compilerContext(ts, canonicalRoot, tsconfig, candidate.files, observeInput)
    .configInputPaths;
}

function resolveRelativeFallback(specifier, containingFile, host) {
  const base = path.resolve(path.dirname(containingFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.mts'),
    path.join(base, 'index.cts'),
  ];
  return candidates.find((candidate) => host.fileExists(candidate));
}

function resolveDependency(ts, dependency, containingFile, options, host) {
  if (!dependency.specifier) return { resolution: 'dynamic' };
  let resolvedFile;
  let resolverFailed = false;
  try {
    resolvedFile = ts.resolveModuleName(
      dependency.specifier,
      containingFile,
      options,
      host
    ).resolvedModule?.resolvedFileName;
  } catch {
    resolverFailed = true;
    resolvedFile = undefined;
  }
  if (!resolvedFile && dependency.specifier.startsWith('.')) {
    resolvedFile = resolveRelativeFallback(dependency.specifier, containingFile, host);
  }
  if (!resolvedFile) return { resolution: 'unresolved', resolverFailed };
  const target = host.candidatePath(resolvedFile);
  const resolution = target
    ? { resolution: 'resolved-project', target }
    : { resolution: 'resolved-external' };
  return { ...resolution, resolverFailed };
}

function declaredIntent(value, config) {
  if (looksLikeArkIntent(value)) return true;
  return config.layers.some((layer) =>
    (layer.intentPrefixes ?? []).some((prefix) => {
      const normalized = prefix.endsWith('.') ? prefix : `${prefix}.`;
      return value.startsWith(normalized) && value.length > normalized.length;
    })
  );
}

function mayContainForbiddenCapability(ts, sourceFile, forbiddenGlobals) {
  // Every symbol-aware match originates in an identifier or static string path segment.
  // Inspect decoded AST text so escaped identifiers still take the full checker path.
  const segments = new Set(forbiddenGlobals.flatMap((entry) => entry.split('.')));
  let found = false;
  const visit = (node) => {
    if (!found &&
      (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) &&
      segments.has(node.text)
    ) {
      found = true;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function collectPolicyFacts(ts, sourceFile, relativePath, config) {
  const publishCalls = [];
  const intentReferences = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && isPublishCall(ts, node)) {
      const firstArg = node.arguments[0];
      publishCalls.push({
        file: relativePath,
        line: lineOf(sourceFile, node.getStart(sourceFile)),
        ...(stringLiteralText(ts, firstArg)
          ? { rawIntentName: stringLiteralText(ts, firstArg) }
          : {}),
        objectHasIntent: objectHasProperty(ts, firstArg, 'intent'),
        arkPublishCandidate: isArkPublishCandidate(ts, node),
        hasSource: publishHasSource(ts, node),
        ...(publishSourceLiteral(ts, node)
          ? { sourceIntent: publishSourceLiteral(ts, node) }
          : {}),
      });
    }
    if (ts.isStringLiteralLike(node) && declaredIntent(node.text, config)) {
      intentReferences.push({
        file: relativePath,
        line: lineOf(sourceFile, node.getStart(sourceFile)),
        intent: node.text,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { publishCalls, intentReferences };
}

function syntaxPropertyName(ts, node) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return undefined;
}

function objectLiteralHasProperty(ts, object, name) {
  return Boolean(
    object?.properties?.some((property) => {
      if (ts.isShorthandPropertyAssignment(property)) return property.name.text === name;
      return property.name ? syntaxPropertyName(ts, property.name) === name : false;
    })
  );
}

function tsSuppressionPositions(sourceFile, source) {
  const positions = new Set();
  for (const directive of sourceFile.commentDirectives ?? []) {
    const start = directive.range?.pos;
    const end = directive.range?.end;
    if (Number.isInteger(start) && Number.isInteger(end)) {
      const text = source.slice(start, end);
      if (/\@ts-ignore\b/.test(text)) positions.add(start);
    }
  }
  const noCheck = sourceFile.pragmas?.get?.('ts-nocheck');
  for (const entry of Array.isArray(noCheck) ? noCheck : noCheck ? [noCheck] : []) {
    if (Number.isInteger(entry.range?.pos)) positions.add(entry.range.pos);
  }
  return [...positions];
}

function collectSafetyUses(ts, sourceFile, relativePath, source, dependencies) {
  const facts = tsSuppressionPositions(sourceFile, source).map((position) => ({
    file: relativePath,
    line: lineOf(sourceFile, position),
    kind: 'ts-suppression',
  }));
  for (const dependency of dependencies) {
    if (!dependency.unresolved) continue;
    facts.push({
      file: relativePath,
      line: dependency.line,
      kind: dependency.kind === 'require' ? 'dynamic-require' : 'dynamic-import',
    });
  }

  const importedFactories = new Map();
  const arkNamespaces = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier)) {
      continue;
    }
    if (!/^arkgate(?:\/runtime)?$/.test(statement.moduleSpecifier.text)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) arkNamespaces.add(bindings.name.text);
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      const requirements = IN_MEMORY_DEFAULT_FACTORIES.get(imported);
      if (requirements) importedFactories.set(element.name.text, { imported, requirements });
    }
  }

  const visit = (node) => {
    if (
      (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) &&
      node.type?.kind === ts.SyntaxKind.AnyKeyword
    ) {
      facts.push({
        file: relativePath,
        line: lineOf(sourceFile, node.getStart(sourceFile)),
        kind: 'any-cast',
      });
    }

    if (ts.isImportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      const fromArk =
        ts.isStringLiteralLike(specifier) && /^arkgate(?:\/runtime)?$/.test(specifier.text);
      if (fromArk) {
        const elements =
          node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
            ? node.importClause.namedBindings.elements
            : [];
        for (const element of elements) {
          const imported = element.propertyName?.text ?? element.name.text;
          if (IN_MEMORY_STORES.has(imported)) {
            facts.push({
              file: relativePath,
              line: lineOf(sourceFile, element.getStart(sourceFile)),
              kind: 'in-memory-store',
              symbol: imported,
            });
          }
        }
      }
    }

    if (ts.isCallExpression(node)) {
      let factory;
      if (ts.isIdentifier(node.expression)) {
        factory = importedFactories.get(node.expression.text);
      } else if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        arkNamespaces.has(node.expression.expression.text)
      ) {
        const imported = node.expression.name.text;
        const requirements = IN_MEMORY_DEFAULT_FACTORIES.get(imported);
        if (requirements) factory = { imported, requirements };
      }
      if (factory) {
        const options = node.arguments[0];
        const definitelyDefaults =
          !options ||
          (ts.isIdentifier(options) && options.text === 'undefined') ||
          (ts.isObjectLiteralExpression(options) &&
            factory.requirements.some((name) => !objectLiteralHasProperty(ts, options, name)));
        if (definitelyDefaults) {
          facts.push({
            file: relativePath,
            line: lineOf(sourceFile, node.getStart(sourceFile)),
            kind: 'in-memory-store',
            symbol: `${factory.imported} defaults`,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return facts;
}

function unavailableFacts(config, ts, reason) {
  return createTrustedResolvedCandidateFacts({
    schemaVersion: '1.0',
    completeness: 'unavailable',
    completenessReasons: [{ code: 'RESOLVER_UNAVAILABLE', message: reason }],
    resolverIdentity: RESOLVED_FACTS_RESOLVER_IDENTITY,
    compilerIdentity: `typescript@${ts?.version ?? 'unavailable'}`,
    compilerOptionsHash: deterministicHash('unavailable'),
    tsconfigHash: deterministicHash('unavailable'),
    evidenceRequirementsHash: resolvedFactsEvidenceRequirementsHash(config),
    files: [],
    dependencies: [],
    capabilityUses: [],
    ambientUses: [],
    publishCalls: [],
    intentReferences: [],
    safetyUses: [],
  });
}

/** Resolve one complete candidate tree (base or virtual overlay) into versioned neutral facts. */
export function resolveCandidateFacts({
  root,
  config,
  ts,
  tsconfig,
  changes = [],
  observeInput,
}) {
  if (!ts?.createSourceFile || !ts?.resolveModuleName) {
    return unavailableFacts(config, ts, 'No API-compatible TypeScript resolver is available.');
  }

  let canonicalRoot;
  let candidateFiles;
  let canonicalChanges;
  let compiler;
  try {
    observeResolvedInput(observeInput, root, 'realpath');
    canonicalRoot = fs.realpathSync(root);
    const candidate = collectCandidateFiles(canonicalRoot, config, changes, observeInput);
    candidateFiles = candidate.files;
    canonicalChanges = candidate.changes;
    compiler = compilerContext(ts, canonicalRoot, tsconfig, candidateFiles, observeInput);
  } catch (error) {
    return unavailableFacts(
      config,
      ts,
      error instanceof Error ? error.message : String(error)
    );
  }

  const host = createOverlayModuleHost(
    ts,
    canonicalRoot,
    candidateFiles,
    canonicalChanges,
    observeInput
  );
  const forbiddenGlobals = [
    ...new Set([
      ...AMBIENT_CAPABILITY_ENTRIES,
      ...config.layers.flatMap((layer) => layer.forbiddenGlobals ?? []),
    ]),
  ];
  const completenessReasons = [...compiler.reasons];
  const parsed = new Map();
  const files = [];
  const capabilityUses = [];
  const ambientUses = [];
  const publishCalls = [];
  const intentReferences = [];
  const safetyUses = [];

  for (const candidate of candidateFiles) {
    const sourceFile = ts.createSourceFile(
      candidate.absolute,
      candidate.content,
      ts.ScriptTarget.Latest,
      true,
      ts.getScriptKindFromFileName?.(candidate.absolute)
    );
    const parseDiagnosticCount = sourceFile.parseDiagnostics?.length ?? 0;
    const exportsOnlyTypes = sourceFileExportsOnlyTypes(ts, sourceFile);
    const typeNames = typeOnlyExportNames(ts, sourceFile);
    const hasTopLevelSideEffects = sourceFileHasTopLevelSideEffects(ts, sourceFile);
    const semanticDependencies = extractSemanticDependencies(ts, sourceFile);
    const resolvedDependencies = semanticDependencies.map(({ node, ...dependency }) => ({
      ...dependency,
      namedBindings: namedModuleBindings(ts, node),
    }));
    let portProofEligible = false;
    if (/\bimport\s*\{[^}]+\}\s*from\s*['"]\.\.?\//.test(candidate.content)) {
      try {
        portProofEligible = Boolean(
          provePortProofInject(ts, candidate.content, { filePath: candidate.absolute, sourceFile })
            .eligible
        );
      } catch {
        portProofEligible = false;
      }
    }
    parsed.set(candidate.path, {
      candidate,
      exportsOnlyTypes,
      typeOnlyExportNames: typeNames,
      hasTopLevelSideEffects,
      portProofEligible,
      dependencies: resolvedDependencies,
    });
    files.push({
      path: candidate.path,
      contentHash: deterministicHash(candidate.content),
      parseStatus: parseDiagnosticCount === 0 ? 'parsed' : 'invalid',
      parseDiagnosticCount,
      exportsOnlyTypes,
      typeOnlyExportNames: typeNames,
      hasTopLevelSideEffects,
    });
    if (parseDiagnosticCount > 0) {
      completenessReasons.push({
        code: 'PARSE_FAILURE',
        file: candidate.path,
        message: `${candidate.path} has ${parseDiagnosticCount} TypeScript parse diagnostic(s).`,
      });
    }
    const forbiddenUses = mayContainForbiddenCapability(ts, sourceFile, forbiddenGlobals)
      ? collectForbiddenCapabilityUses(ts, sourceFile, forbiddenGlobals)
      : [];
    capabilityUses.push(
      ...collectCapabilityUses(ts, sourceFile, {
        dependencies: semanticDependencies,
        ambientUses: forbiddenUses,
      }).map((use) => ({
        file: candidate.path,
        line: use.line,
        symbol: use.symbol,
        capability: use.capability,
        source: use.source,
      }))
    );
    ambientUses.push(
      ...forbiddenUses.map((use) => ({
        file: candidate.path,
        line: use.line,
        symbol: use.name,
      }))
    );
    const policy = collectPolicyFacts(ts, sourceFile, candidate.path, config);
    publishCalls.push(...policy.publishCalls);
    intentReferences.push(...policy.intentReferences);
    safetyUses.push(
      ...collectSafetyUses(ts, sourceFile, candidate.path, candidate.content, semanticDependencies)
    );
  }

  const dependencies = [];
  for (const source of parsed.values()) {
    for (const dependency of source.dependencies) {
      const resolved = resolveDependency(
        ts,
        dependency,
        source.candidate.absolute,
        compiler.optionsFor(source.candidate.absolute),
        host
      );
      if (resolved.resolverFailed) {
        completenessReasons.push({
          code: 'MODULE_RESOLUTION_FAILURE',
          file: source.candidate.path,
          message:
            `TypeScript module resolution failed for ${JSON.stringify(dependency.specifier)}` +
            ` at line ${dependency.line}.`,
        });
      }
      const namedBindings = dependency.namedBindings;
      const target = resolved.target ? parsed.get(resolved.target) : undefined;
      const staticEdge = dependency.kind === 'import' || dependency.kind === 'export';
      const targetTypeNames = new Set(target?.typeOnlyExportNames ?? []);
      const targetTypeOnlyExports = Boolean(
        target && staticEdge && target.exportsOnlyTypes && !dependency.typeOnly
      );
      const namedBindingsTypeOnly = Boolean(
        staticEdge &&
          namedBindings?.length > 0 &&
          targetTypeNames.size > 0 &&
          !target?.hasTopLevelSideEffects &&
          namedBindings.every((name) => targetTypeNames.has(name))
      );
      const portProofEligible = Boolean(
        target &&
          dependency.kind === 'import' &&
          !dependency.typeOnly &&
          !targetTypeOnlyExports &&
          !namedBindingsTypeOnly &&
          source.portProofEligible
      );
      dependencies.push({
        from: source.candidate.path,
        ...(dependency.specifier ? { specifier: dependency.specifier } : {}),
        kind: dependency.kind,
        typeOnly: dependency.typeOnly,
        line: dependency.line,
        resolution: resolved.resolution,
        ...(resolved.target ? { target: resolved.target } : {}),
        ...(namedBindings ? { namedBindings } : {}),
        ...(targetTypeOnlyExports
          ? { targetTypeOnlyExports: true }
          : {}),
        ...(source.exportsOnlyTypes ? { sourcePureTypeModule: true } : {}),
        ...(namedBindingsTypeOnly ? { namedBindingsTypeOnly: true } : {}),
        ...(portProofEligible ? { portProofEligible: true } : {}),
      });
    }
  }

  const projectPackageName = readPackageName(canonicalRoot, observeInput);
  return createTrustedResolvedCandidateFacts({
    schemaVersion: '1.0',
    completeness: completenessReasons.length === 0 ? 'complete' : 'partial',
    completenessReasons,
    resolverIdentity: RESOLVED_FACTS_RESOLVER_IDENTITY,
    compilerIdentity: `typescript@${ts.version ?? 'unknown'}`,
    compilerOptionsHash: compiler.compilerOptionsHash,
    tsconfigHash: compiler.tsconfigHash,
    evidenceRequirementsHash: resolvedFactsEvidenceRequirementsHash(config),
    ...(projectPackageName ? { projectPackageName } : {}),
    files,
    dependencies,
    capabilityUses,
    ambientUses,
    publishCalls,
    intentReferences,
    safetyUses,
  });
}
