/**
 * tsconfig `paths` / `baseUrl` alias resolution for the ESLint adapter (P0-C parity).
 *
 * Mirrors the CLI's `ts.findConfigFile(dirname(file))`: the nearest tsconfig.json above the
 * linted file wins. Reads JSONC (comments + trailing commas), follows relative, absolute,
 * package and array `extends`, and applies TypeScript inheritance (a child's `paths` replaces
 * the parent's; `paths` resolve against `baseUrl`, else against the tsconfig that declares
 * them). Results are cached per tsconfig chain and invalidated by mtime/size.
 *
 * Not claimed (documented residual): project references, catch-all `*` mappings, bare
 * packages/workspaces, and symlink hops. CI / preflight stay the source of truth there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseJsonc } from './jsonc';

export type TsconfigAlias = {
  /** Pattern text before `*` (whole pattern when it has no `*`). */
  from: string;
  /** First target with the trailing `*` removed (legacy shape). */
  to: string;
  /** Text after `*` in the pattern ('' for trailing-star patterns). */
  suffix: string;
  wildcard: boolean;
  /** All substitution targets, in declaration order. */
  targets: string[];
};

export type TsconfigAliasSet = { baseUrl: string; aliases: TsconfigAlias[] };

type ChainStamp = { file: string; stamp: string };
type ParsedEntry = { chain: ChainStamp[]; result: TsconfigAliasSet };

const nearestCache = new Map<string, string | null>();
const parsedCache = new Map<string, ParsedEntry>();
/** Keep the parsed-chain cache small in a long-lived editor process. */
const PARSED_CACHE_CAP = 64;

function fileStamp(file: string): string {
  try {
    const stat = fs.statSync(file);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return 'missing';
  }
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Nearest `tsconfig.json` at or above `startDir` (memoized per directory). */
export function findNearestTsconfig(startDir: string): string | null {
  const dir = path.resolve(startDir);
  const cached = nearestCache.get(dir);
  if (cached !== undefined && (cached === null || isFile(cached))) return cached;
  const candidate = path.join(dir, 'tsconfig.json');
  let found: string | null;
  if (isFile(candidate)) {
    found = candidate;
  } else {
    const parent = path.dirname(dir);
    found = parent === dir ? null : findNearestTsconfig(parent);
  }
  nearestCache.set(dir, found);
  return found;
}

function resolvePackageExtends(fromDir: string, spec: string): string | null {
  let dir = fromDir;
  for (;;) {
    const base = path.join(dir, 'node_modules', spec);
    for (const candidate of [base, `${base}.json`]) {
      if (isFile(candidate)) return candidate;
    }
    const pkgJson = path.join(base, 'package.json');
    if (isFile(pkgJson)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8')) as { tsconfig?: unknown };
        if (typeof pkg.tsconfig === 'string' && isFile(path.join(base, pkg.tsconfig))) {
          return path.join(base, pkg.tsconfig);
        }
      } catch {
        /* fall through */
      }
    }
    if (isFile(path.join(base, 'tsconfig.json'))) return path.join(base, 'tsconfig.json');
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function resolveExtends(fromFile: string, spec: string): string | null {
  const dir = path.dirname(fromFile);
  if (spec.startsWith('.') || path.isAbsolute(spec)) {
    const base = path.resolve(dir, spec);
    for (const candidate of [base, `${base}.json`]) {
      if (isFile(candidate)) return candidate;
    }
    return null;
  }
  return resolvePackageExtends(dir, spec);
}

type Effective = {
  baseUrl?: string; // absolute
  paths?: Record<string, unknown>;
  pathsBase?: string; // absolute dir of the tsconfig that declared `paths`
};

function substituteConfigDir(value: string, configDir: string): string {
  return value.split('${configDir}').join(configDir);
}

function loadChain(
  file: string,
  rootConfigDir: string,
  depth: number,
  seen: Set<string>,
  chain: ChainStamp[]
): Effective {
  if (depth > 8 || seen.has(file)) return {};
  seen.add(file);
  chain.push({ file, stamp: fileStamp(file) });
  let json: Record<string, unknown>;
  try {
    json = (parseJsonc(fs.readFileSync(file, 'utf8')) ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
  const effective: Effective = {};
  const ext = json.extends;
  const parents = typeof ext === 'string' ? [ext] : Array.isArray(ext) ? ext : [];
  for (const parentSpec of parents) {
    if (typeof parentSpec !== 'string') continue;
    const resolvedSpec = substituteConfigDir(parentSpec, rootConfigDir);
    const parentFile = resolveExtends(file, resolvedSpec);
    if (!parentFile) {
      // A relative/absolute parent that does not exist yet still invalidates the
      // cached parse the moment it appears.
      if (resolvedSpec.startsWith('.') || path.isAbsolute(resolvedSpec)) {
        const base = path.resolve(path.dirname(file), resolvedSpec);
        for (const candidate of [base, `${base}.json`]) {
          chain.push({ file: candidate, stamp: fileStamp(candidate) });
        }
      }
      continue;
    }
    const parent = loadChain(parentFile, rootConfigDir, depth + 1, seen, chain);
    if (parent.baseUrl !== undefined) effective.baseUrl = parent.baseUrl;
    if (parent.paths !== undefined) {
      effective.paths = parent.paths;
      effective.pathsBase = parent.pathsBase;
    }
  }
  const compilerOptions = (json.compilerOptions ?? {}) as Record<string, unknown>;
  const configDir = path.dirname(file);
  if (typeof compilerOptions.baseUrl === 'string') {
    effective.baseUrl = path.resolve(
      configDir,
      substituteConfigDir(compilerOptions.baseUrl, rootConfigDir)
    );
  }
  if (compilerOptions.paths && typeof compilerOptions.paths === 'object') {
    // TypeScript replaces (does not merge) an inherited `paths` object.
    effective.paths = compilerOptions.paths as Record<string, unknown>;
    effective.pathsBase = configDir;
  }
  return effective;
}

function buildAliasSet(effective: Effective, rootConfigDir: string): TsconfigAliasSet {
  const baseUrl = effective.baseUrl ?? effective.pathsBase ?? rootConfigDir;
  const aliases: TsconfigAlias[] = [];
  for (const [pattern, rawTargets] of Object.entries(effective.paths ?? {})) {
    if (!Array.isArray(rawTargets) || rawTargets.length === 0) continue;
    const targets = rawTargets
      .filter((target): target is string => typeof target === 'string')
      .map((target) => substituteConfigDir(target, rootConfigDir));
    if (targets.length === 0) continue;
    const star = pattern.indexOf('*');
    const wildcard = star >= 0;
    const from = wildcard ? pattern.slice(0, star) : pattern;
    const suffix = wildcard ? pattern.slice(star + 1) : '';
    if (wildcard && !from && !suffix) continue; // catch-all `*` stays CI truth
    aliases.push({ from, to: targets[0]!.replace(/\*$/, ''), suffix, wildcard, targets });
  }
  // TypeScript: exact patterns first, then the longest matching prefix.
  aliases.sort(
    (a, b) => Number(a.wildcard) - Number(b.wildcard) || b.from.length - a.from.length
  );
  return { baseUrl, aliases };
}

/** Parsed aliases for one tsconfig file (cached; invalidated by mtime/size of its chain). */
export function aliasesForTsconfig(tsconfigPath: string): TsconfigAliasSet {
  const cached = parsedCache.get(tsconfigPath);
  if (cached && cached.chain.every((entry) => fileStamp(entry.file) === entry.stamp)) {
    return cached.result;
  }
  const chain: ChainStamp[] = [];
  const rootConfigDir = path.dirname(tsconfigPath);
  const effective = loadChain(tsconfigPath, rootConfigDir, 0, new Set(), chain);
  const result = buildAliasSet(effective, rootConfigDir);
  if (!parsedCache.has(tsconfigPath) && parsedCache.size >= PARSED_CACHE_CAP) {
    const oldest = parsedCache.keys().next().value;
    if (oldest !== undefined) parsedCache.delete(oldest);
  }
  parsedCache.set(tsconfigPath, { chain, result });
  return result;
}

/**
 * Read tsconfig paths/baseUrl for ESLint alias parity (P0-C) from the nearest tsconfig.json
 * at or above `startDir`.
 */
export function readTsconfigPathAliases(startDir: string): TsconfigAliasSet {
  const configPath = findNearestTsconfig(startDir);
  if (!configPath) return { baseUrl: path.resolve(startDir), aliases: [] };
  return aliasesForTsconfig(configPath);
}

/** Probe on-disk TS/JS candidates for a resolved base path (no package resolution). */
export function existingSourceFile(base: string): string | null {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}.cts`,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
  ];
  for (const candidate of candidates) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

/** Resolve relative import specifier to an absolute path candidate (TS-oriented). */
export function resolveRelativeImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  return existingSourceFile(base);
}

function matchAlias(alias: TsconfigAlias, specifier: string): string | null {
  if (!alias.wildcard) return specifier === alias.from ? '' : null;
  if (!specifier.startsWith(alias.from) || !specifier.endsWith(alias.suffix)) return null;
  if (specifier.length < alias.from.length + alias.suffix.length) return null;
  return specifier.slice(alias.from.length, specifier.length - alias.suffix.length);
}

/**
 * Resolve relative or tsconfig path-alias import to an on-disk file.
 * The tsconfig is the one nearest to `fromFile` (same as the CLI). `projectRoot` is only a
 * fallback start directory when `fromFile` is empty. Bare packages return null.
 */
export function resolveImportSpecifier(
  fromFile: string,
  specifier: string,
  projectRoot?: string | null
): string | null {
  if (!specifier) return null;
  if (specifier.startsWith('.')) return resolveRelativeImport(fromFile, specifier);

  const startDir = fromFile ? path.dirname(path.resolve(fromFile)) : (projectRoot ?? '.');
  const { baseUrl, aliases } = readTsconfigPathAliases(startDir);
  for (const alias of aliases) {
    const captured = matchAlias(alias, specifier);
    if (captured === null) continue;
    for (const target of alias.targets) {
      const mapped = alias.wildcard ? target.split('*').join(captured) : target;
      const hit = existingSourceFile(path.resolve(baseUrl, mapped));
      if (hit) return hit;
    }
    return null; // longest matching pattern wins, like TypeScript
  }
  return null;
}

/** Test hook: drop memoized tsconfig lookups. */
export function clearTsconfigAliasCache(): void {
  nearestCache.clear();
  parsedCache.clear();
}
