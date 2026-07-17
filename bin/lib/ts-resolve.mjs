/**
 * TypeScript module resolution + per-file scan cache for ark-check.
 * Extracted from ark-check entry (R3).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function createModuleResolutionHost(ts) {
  const sys = ts?.sys;
  const fileExists = (f) => {
    if (sys?.fileExists) return sys.fileExists(f);
    return fs.existsSync(f);
  };
  const readFile = (f) => {
    if (sys?.readFile) return sys.readFile(f);
    try {
      return fs.readFileSync(f, 'utf8');
    } catch {
      return undefined;
    }
  };
  const directoryExists = (d) => {
    if (sys?.directoryExists) return sys.directoryExists(d);
    try {
      return fs.statSync(d).isDirectory();
    } catch {
      return false;
    }
  };
  return {
    fileExists,
    readFile,
    directoryExists,
    getCurrentDirectory: () =>
      sys?.getCurrentDirectory ? sys.getCurrentDirectory() : process.cwd(),
    getDirectories: (d) => {
      if (sys?.getDirectories) return sys.getDirectories(d);
      try {
        return fs
          .readdirSync(d, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
      } catch {
        return [];
      }
    },
    realpath: sys?.realpath ? (p) => sys.realpath(p) : undefined,
    useCaseSensitiveFileNames: sys?.useCaseSensitiveFileNames ?? true,
  };
}

export function parseTsconfig(ts, configPath) {
  const host = createModuleResolutionHost(ts);
  const read = ts.readConfigFile(configPath, host.readFile);
  if (read.error) return {};
  // parseJsonConfigFileContent wants a ParseConfigHost-like object; our resolution host
  // is enough for option extraction.
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    {
      useCaseSensitiveFileNames: host.useCaseSensitiveFileNames,
      readDirectory: ts.sys?.readDirectory
        ? (...args) => ts.sys.readDirectory(...args)
        : () => [],
      fileExists: host.fileExists,
      readFile: host.readFile,
    },
    path.dirname(configPath)
  );
  return parsed.options;
}

/**
 * Compiler options for a given source file. With --tsconfig every file uses that one
 * config; otherwise each file uses the NEAREST tsconfig.json above it (like tsc does),
 * so monorepo packages with per-package path aliases resolve correctly under one --root.
 */
export function createCompilerOptionsLookup(ts, root, tsconfigArg) {
  if (tsconfigArg) {
    const configPath = path.isAbsolute(tsconfigArg) ? tsconfigArg : path.join(root, tsconfigArg);
    const options = fs.existsSync(configPath) ? parseTsconfig(ts, configPath) : {};
    return () => options;
  }
  const byDir = new Map();
  const byConfig = new Map();
  return (file) => {
    const dir = path.dirname(file);
    if (byDir.has(dir)) return byDir.get(dir);
    const configPath = ts.findConfigFile(dir, ts.sys.fileExists, 'tsconfig.json');
    let options = {};
    if (configPath) {
      if (!byConfig.has(configPath)) byConfig.set(configPath, parseTsconfig(ts, configPath));
      options = byConfig.get(configPath);
    }
    byDir.set(dir, options);
    return options;
  };
}

/**
 * Per-file scan cache. A cache entry stores the parsed file's content-derived results:
 * content violations (forbidden globals, publish checks, intent references) and the list
 * of module-edge specifiers. Edges are NEVER cached as violations — they are re-resolved
 * against the live filesystem every run, because resolution depends on files and tsconfigs
 * outside the cached file. The whole cache is keyed by the config+manifest contents, so
 * any rule change invalidates everything.
 */
export function scanCachePath(root) {
  return path.join(root, 'node_modules', '.cache', 'ark-check.json');
}

export function scanCacheKey(root, args, parserIdentity = '') {
  const read = (p) => {
    try {
      return fs.readFileSync(p, 'utf8');
    } catch {
      return '';
    }
  };
  const configPath = path.isAbsolute(args.config) ? args.config : path.join(root, args.config);
  const manifestPath = args.manifest
    ? path.isAbsolute(args.manifest)
      ? args.manifest
      : path.join(root, args.manifest)
    : undefined;
  // Bump this schema tag whenever the cached scan shape or detection semantics change, so a
  // warm cache from an older Ark can't feed stale entries to new logic. v2: typeOnly on edges.
  // v3: per-file exportsOnlyTypes. v4: typeOnlyExportNames + namedBindings.
  // v5: hasTopLevelSideEffects. v6: non-exported impure inits + non-export class statics.
  // v7: scope-aware forbidden globals + import-equals dependency edges.
  // v8: opted-in capability walls (U04) — stale caches must not miss wall verdicts.
  // v9: per-file parseDiagnosticCount + parser identity (Y03); no raw diagnostics.
  return crypto
    .createHash('sha1')
    .update(`ark-check-cache-v9\0${String(parserIdentity)}\0${read(configPath)}\0${manifestPath ? read(manifestPath) : ''}`)
    .digest('hex');
}

export function loadScanCache(root, key) {
  try {
    const data = JSON.parse(fs.readFileSync(scanCachePath(root), 'utf8'));
    return data.key === key && data.files && typeof data.files === 'object' ? data.files : undefined;
  } catch {
    return undefined;
  }
}

export function saveScanCache(root, key, files) {
  try {
    const target = scanCachePath(root);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify({ key, files }));
  } catch {
    // cache is best-effort: read-only filesystems just re-parse every run
  }
}

/**
 * Fallback resolver for extensionless relative imports whose on-disk target uses an
 * extension `ts.resolveModuleName` won't resolve without a matching tsconfig
 * (notably `.mts`/`.cts`). Mirrors the classic candidate list.
 */
export function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

export function resolveRelativeFallback(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base, // only used when the specifier already carries an extension (isFile filters dirs)
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
  // isFile (not existsSync) so a directory named like the specifier never shadows the
  // real module file — e.g. `./foo` must not resolve to a `foo/` directory before `foo.mts`.
  return candidates.find(isFile);
}

/**
 * Resolve any import specifier (relative, tsconfig path-alias, or package) to a source
 * file using TypeScript's module resolver, returning the resolved file (or undefined for
 * unresolved / declaration-only targets).
 *
 * ark-check governs one project rooted at --root. A resolved target is skipped when its
 * path RELATIVE TO ROOT either escapes the root (leading `..`) or contains a `node_modules`
 * segment. Using the root-relative path (not an absolute substring) means a project that
 * itself lives under a node_modules segment is still governed, while a broad catch-all
 * pattern (`**`) can't false-flag vendored deps or files outside the project. Monorepos can
 * run under a single --root (per-package tsconfigs are honored via the nearest-tsconfig
 * lookup); edges that resolve outside the root are still skipped.
 */
export function resolveImport(ts, specifier, containingFile, options, host, root) {
  let file;
  // Explicit relative extensions are already unambiguous on disk. Avoid a full TypeScript
  // resolver walk for the common ESM/CJS form; retain TypeScript as the fallback for aliases,
  // packages, extensionless imports, and any explicit path that is not an existing file.
  if (specifier.startsWith('.') && path.extname(specifier)) {
    file = resolveRelativeFallback(containingFile, specifier);
  }
  if (!file) {
    const res = ts.resolveModuleName(specifier, containingFile, options, host);
    file = res.resolvedModule?.resolvedFileName;
  }
  if (!file && specifier.startsWith('.')) {
    file = resolveRelativeFallback(containingFile, specifier);
  }
  if (!file) return undefined;
  if (file.endsWith('.d.ts')) return undefined;
  const abs = path.resolve(file);
  const segments = path.relative(root, abs).split(path.sep);
  if (segments[0] === '..' || segments.includes('node_modules')) return undefined;
  return abs;
}
