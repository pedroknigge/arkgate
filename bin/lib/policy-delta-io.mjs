import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { analyzePolicyDelta } from './analysis-engine.mjs';

function readJsonFile(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`${label} not found: ${filePath}`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `${label} is not valid JSON (${filePath}): ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function runGit(cwd, args) {
  return spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function safeRef(value) {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/.test(value) &&
    !value.includes('..')
  );
}

export function normalizePolicyBaseRef(value) {
  const ref = typeof value === 'string' ? value.trim() : '';
  return /^0{40,64}$/.test(ref) ? '' : ref;
}

function repositoryRoot(root) {
  const result = runGit(root, ['rev-parse', '--show-toplevel']);
  return result.status === 0 ? result.stdout.trim() : null;
}

function discoverLocalBaseRef(root) {
  const top = repositoryRoot(root);
  if (!top) return null;
  const remoteHead = runGit(top, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  const candidates = [
    remoteHead.status === 0 ? remoteHead.stdout.trim() : null,
    'origin/main',
    'origin/master',
  ].filter(Boolean);
  const current = runGit(top, ['branch', '--show-current']);
  const currentBranch = current.status === 0 ? current.stdout.trim() : '';

  for (const candidate of candidates) {
    if (!safeRef(candidate)) continue;
    const exists = runGit(top, ['rev-parse', '--verify', `${candidate}^{commit}`]);
    if (exists.status !== 0) continue;
    if (currentBranch && candidate === `origin/${currentBranch}`) return null;
    const mergeBase = runGit(top, ['merge-base', 'HEAD', candidate]);
    if (mergeBase.status === 0 && safeRef(mergeBase.stdout.trim())) return mergeBase.stdout.trim();
  }
  return null;
}

function configPathInRepository(root, configPath, top) {
  const requested = path.isAbsolute(configPath) ? configPath : path.resolve(root, configPath);
  const absolute = fs.realpathSync(requested);
  const canonicalTop = fs.realpathSync(top);
  const relative = path.relative(canonicalTop, absolute).split(path.sep).join('/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error(`Policy config must be inside the Git repository: ${absolute}`);
  }
  return relative;
}

export function resolvePolicyBaseConfig({
  root,
  configPath,
  basePath,
  baseRef,
  env = process.env,
}) {
  if (basePath) {
    const absolute = path.isAbsolute(basePath) ? basePath : path.resolve(root, basePath);
    return { config: readJsonFile(absolute, 'Policy base'), source: absolute, ref: null };
  }

  const envRef = normalizePolicyBaseRef(env.ARK_POLICY_BASE_REF);
  const githubBase = typeof env.GITHUB_BASE_REF === 'string' ? env.GITHUB_BASE_REF.trim() : '';
  const requestedRef = baseRef || envRef || (githubBase ? `origin/${githubBase}` : '');
  const ref = requestedRef || discoverLocalBaseRef(root);
  if (!ref) return null;
  if (!safeRef(ref)) throw new Error(`Unsafe policy base ref: ${ref}`);

  const top = repositoryRoot(root);
  if (!top) {
    // GitHub and ARK_POLICY_BASE_REF describe the process workspace, which may
    // be different from an explicitly checked nested/temporary project root.
    // Only the CLI flag is an unambiguous request to resolve this exact root.
    if (baseRef) throw new Error(`Cannot resolve policy base ref outside a Git repository: ${ref}`);
    return null;
  }
  const relativeConfig = configPathInRepository(root, configPath, top);
  const result = runGit(top, ['show', `${ref}:${relativeConfig}`]);
  if (result.status !== 0) {
    const refExists = runGit(top, ['rev-parse', '--verify', `${ref}^{commit}`]);
    // A newly adopted contract has no predecessor to weaken. CI-provided and
    // auto-discovered bases may therefore omit the config; an explicit CLI ref
    // remains fail-closed because the caller asked to compare that exact input.
    if (refExists.status === 0 && !baseRef) return null;
    if (requestedRef) {
      throw new Error(
        `Cannot read policy base ${ref}:${relativeConfig}: ${result.stderr.trim() || 'git show failed'}`
      );
    }
    return null;
  }
  try {
    return {
      config: JSON.parse(result.stdout),
      source: `git:${ref}:${relativeConfig}`,
      ref,
    };
  } catch (error) {
    throw new Error(
      `Policy base ${ref}:${relativeConfig} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function readPolicyAcknowledgement(root, acknowledgementPath) {
  if (!acknowledgementPath) return undefined;
  const absolute = path.isAbsolute(acknowledgementPath)
    ? acknowledgementPath
    : path.resolve(root, acknowledgementPath);
  return readJsonFile(absolute, 'Policy acknowledgement');
}

export function analyzePolicyTransition({
  root,
  configPath,
  candidateConfig,
  strictMerge,
  basePath,
  baseRef,
  acknowledgementPath,
}) {
  if (!strictMerge && !basePath && !baseRef && !acknowledgementPath) return undefined;
  const base = resolvePolicyBaseConfig({ root, configPath, basePath, baseRef });
  if (!base && (basePath || baseRef || acknowledgementPath)) {
    throw new Error('Policy delta was requested but no policy base could be resolved.');
  }
  if (!base) return undefined;
  return analyzePolicyDelta({
    baseConfig: base.config,
    candidateConfig,
    acknowledgement: readPolicyAcknowledgement(root, acknowledgementPath),
    baseSource: base.source,
    candidateSource: path.isAbsolute(configPath) ? configPath : path.join(root, configPath),
  });
}
