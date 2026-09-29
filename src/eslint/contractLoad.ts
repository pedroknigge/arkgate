/**
 * Ark contract I/O for the ESLint adapter: config discovery, root-config parse, ArkRules
 * Effective Contract resolution (same pure resolver as CLI/MCP), and the fail-closed guard.
 *
 * An invalid contract never crashes the ESLint process. Every Ark rule is wrapped by
 * `withContractGuard`: when the contract that applies to the linted file is invalid, the
 * first Ark rule to run reports one `configInvalid` error on the file (ESLint still exits
 * non-zero — fail closed), and other rules and files keep linting.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArkConfigJson, type ArkConfig } from '../domain/configContract';
import { resolveEffectiveContract } from '../domain/effectiveContract';
import { emptyEffectiveArkRules, type EffectiveArkRules } from '../domain/arkRulesContract';
import { isScanExcludedRelative } from '../domain/layerMatch';
import {
  lintedFilename,
  sourceCodeFor,
  type ArkRule,
  type AstNode,
  type RuleContext,
  type RuleListener,
} from './ruleSupport';
import {
  ADVISORY_FALLBACK_MESSAGE,
  ADVISORY_FALLBACK_MESSAGE_ID,
  createChannelListeners,
} from './reportChannels';

const NEGATIVE_LOOKUP_TTL_MS = 2000;
const configPathCache = new Map<string, { found: string | null; at: number }>();

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function findConfigInDir(dir: string): string | null {
  const cached = configPathCache.get(dir);
  if (cached) {
    if (cached.found !== null && isFile(cached.found)) return cached.found;
    if (cached.found === null && Date.now() - cached.at < NEGATIVE_LOOKUP_TTL_MS) return null;
  }
  const candidate = path.join(dir, 'ark.config.json');
  let found: string | null;
  if (isFile(candidate)) {
    found = candidate;
  } else {
    const parent = path.dirname(dir);
    found = parent === dir ? null : findConfigInDir(parent);
  }
  configPathCache.set(dir, { found, at: Date.now() });
  return found;
}

/** Nearest `ark.config.json` at or above the linted file (memoized per directory). */
export function findConfigPath(startFile: string): string | null {
  if (!startFile || startFile === '<input>' || startFile.startsWith('stdin')) return null;
  return findConfigInDir(path.dirname(path.resolve(startFile)));
}

export type LoadedArkContract = {
  config: ArkConfig | null;
  arkRules: EffectiveArkRules;
  /** Validator text when the root config or a referenced ArkRules file is invalid. */
  error: string | null;
  /** sha256 over the root config and referenced ArkRules sources (cache key material). */
  fingerprint: string | null;
};

type CachedContract = {
  source: string;
  refStamps: string;
  result: LoadedArkContract;
};

const contractCache = new Map<string, CachedContract>();

function arkRulesRefs(config: ArkConfig | null): Array<[string, string]> {
  const refs = config?.arkRules;
  if (!refs || typeof refs !== 'object') return [];
  return Object.entries(refs).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  );
}

/** Read a referenced ArkRules file only when it stays inside the project root. */
function readReferencedFile(root: string, rel: string): string | undefined {
  const normalized = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  const absolute = path.resolve(root, normalized);
  const fromRoot = path.relative(root, absolute);
  if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) return undefined;
  try {
    return fs.readFileSync(absolute, 'utf8');
  } catch {
    return undefined;
  }
}

function refStampsFor(root: string, config: ArkConfig | null): string {
  return arkRulesRefs(config)
    .map(([, rel]) => {
      try {
        const stat = fs.statSync(path.resolve(root, rel));
        return `${rel}:${stat.mtimeMs}:${stat.size}`;
      } catch {
        return `${rel}:missing`;
      }
    })
    .join('|');
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveContract(configPath: string, source: string): LoadedArkContract {
  const root = path.dirname(configPath);
  let config: ArkConfig;
  try {
    config = parseArkConfigJson(source, configPath).config;
  } catch (error) {
    return { config: null, arkRules: emptyEffectiveArkRules(), error: errorText(error), fingerprint: null };
  }
  const refs = arkRulesRefs(config);
  const hash = createHash('sha256').update(source);
  if (refs.length === 0) {
    return {
      config,
      arkRules: emptyEffectiveArkRules(),
      error: null,
      fingerprint: hash.digest('hex'),
    };
  }
  const fileContents: Record<string, string> = {};
  for (const [, rel] of refs) {
    const content = readReferencedFile(root, rel);
    if (content === undefined) continue;
    const key = rel.replace(/\\/g, '/').replace(/^\.\//, '');
    fileContents[key] = content;
    hash.update(`\0${key}\0${content}`);
  }
  try {
    const effective = resolveEffectiveContract({ config, fileContents }, configPath);
    return { config, arkRules: effective.arkRules, error: null, fingerprint: hash.digest('hex') };
  } catch (error) {
    return { config: null, arkRules: emptyEffectiveArkRules(), error: errorText(error), fingerprint: null };
  }
}

/**
 * Load the root config plus its ArkRules Effective Contract. Never throws: a broken
 * contract comes back as `error` (cached by source text and referenced-file stamps).
 */
export function loadArkContract(configPath: string): LoadedArkContract {
  let source: string;
  try {
    source = fs.readFileSync(configPath, 'utf8');
  } catch {
    return { config: null, arkRules: emptyEffectiveArkRules(), error: null, fingerprint: null };
  }
  const root = path.dirname(configPath);
  const cached = contractCache.get(configPath);
  if (cached?.source === source) {
    const stamps = refStampsFor(root, cached.result.config ?? safeConfig(source, configPath));
    if (stamps === cached.refStamps) return cached.result;
  }
  const result = resolveContract(configPath, source);
  contractCache.set(configPath, {
    source,
    refStamps: refStampsFor(root, result.config ?? safeConfig(source, configPath)),
    result,
  });
  return result;
}

function safeConfig(source: string, configPath: string): ArkConfig | null {
  try {
    return parseArkConfigJson(source, configPath).config;
  } catch {
    return null;
  }
}

/**
 * Parse the root config (public helper; throws ArkConfigValidationError on invalid config).
 * Rules use `loadArkContract`, which never throws.
 */
export function loadArkConfig(configPath: string): ArkConfig | null {
  if (!fs.existsSync(configPath)) return null;
  const loaded = loadArkContract(configPath);
  if (loaded.config) return loaded.config;
  // Surface the validator's own error type and text for callers of this helper.
  return parseArkConfigJson(fs.readFileSync(configPath, 'utf8'), configPath).config;
}

/** Same include / exclusion scope as the CLI scan. */
export function sourceIsInAnalysisScope(config: ArkConfig, relativePath: string): boolean {
  const included = (config.include ?? []).some((entry) => {
    const root = String(entry).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
    return root === '.' || relativePath === root || relativePath.startsWith(`${root}/`);
  });
  return included && !isScanExcludedRelative(relativePath, config);
}

/** Config for rule bodies: guarded rules only run when the contract is valid. */
export function configForRule(configPath: string | null): ArkConfig | null {
  return configPath ? loadArkContract(configPath).config : null;
}

// ── Fail-closed guard ──────────────────────────────────────────────────────

export const CONFIG_INVALID_MESSAGE_ID = 'configInvalid';
const CONFIG_INVALID_MESSAGE =
  'Ark contract is invalid, so no architecture verdict is possible (fix it; ark-check fails closed the same way): {{detail}}';

const reportedSources = new WeakSet<object>();

/** Error for the contract that applies to this file, or null when valid / absent. */
export function contractErrorForFile(filename: string): string | null {
  const configPath = findConfigPath(filename);
  if (!configPath) return null;
  return loadArkContract(configPath).error;
}

/** Wrap an Ark rule so an invalid contract becomes one file-level error, never a crash. */
export function withContractGuard(rule: ArkRule): ArkRule {
  return {
    meta: {
      ...rule.meta,
      messages: {
        ...rule.meta.messages,
        [CONFIG_INVALID_MESSAGE_ID]: CONFIG_INVALID_MESSAGE,
        [ADVISORY_FALLBACK_MESSAGE_ID]: ADVISORY_FALLBACK_MESSAGE,
      },
    },
    create(context: RuleContext): RuleListener {
      const error = contractErrorForFile(lintedFilename(context));
      if (!error) return createChannelListeners(rule, context, 'blocking');
      return {
        Program(node: AstNode) {
          const sourceCode = sourceCodeFor(context);
          if (sourceCode && typeof sourceCode === 'object') {
            if (reportedSources.has(sourceCode)) return;
            reportedSources.add(sourceCode);
          }
          context.report({
            ...(node?.loc?.start ? { node } : { loc: { line: 1, column: 0 } }),
            messageId: CONFIG_INVALID_MESSAGE_ID,
            data: { detail: error.replace(/\s*\n\s*/g, ' ') },
          });
        },
      };
    },
  };
}

// ── Cache fingerprint (eslint --cache) ─────────────────────────────────────

/**
 * Fingerprint of the Ark contract that applies under `startDir` (default: cwd). ESLint
 * hashes `settings`, so a recommended config carrying this value invalidates `--cache`
 * results when ark.config.json or a referenced ArkRules file changes.
 */
export function contractFingerprint(startDir: string = process.cwd()): string | null {
  const configPath = findConfigInDir(path.resolve(startDir));
  if (!configPath) return null;
  const loaded = loadArkContract(configPath);
  if (loaded.fingerprint) return loaded.fingerprint;
  try {
    return createHash('sha256').update(fs.readFileSync(configPath, 'utf8')).digest('hex');
  } catch {
    return null;
  }
}

/** Test hook: drop memoized config lookups and parsed contracts. */
export function clearContractCache(): void {
  configPathCache.clear();
  contractCache.clear();
}
