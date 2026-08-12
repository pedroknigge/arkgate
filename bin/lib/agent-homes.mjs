/**
 * Shared agent home skill catalogs (Claude / Grok), Codex-parity monotonic install.
 * Repo catalogs stay per-project; these homes are the machine floor (never downgrade).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { arkCommand } from '../ark-shared.mjs';
import { isTempOrUpgradeRoot } from './codex-home.mjs';
import {
  arkPackageVersion,
  assessSkillCatalogParity,
  detectActiveAgentHost,
  isValidSemver,
  isVersionOlder,
  skillTemplateNames,
  skillTemplates,
} from './skill-install.mjs';
import {
  HOME_SKILL_CATALOG,
  HOME_SKILL_PENDING_CATALOG,
  installSkillCatalog,
  skillInstallLine,
} from './skill-write.mjs';

/** @typedef {'claude'|'grok'} AgentHomeHost */

const HOSTS = {
  claude: {
    id: 'claude',
    label: 'Claude',
    envKey: 'CLAUDE_HOME',
    defaultDirName: '.claude',
    flag: '--claude-home',
  },
  grok: {
    id: 'grok',
    label: 'Grok',
    envKey: 'GROK_HOME',
    defaultDirName: '.grok',
    flag: '--grok-home',
  },
};

export function agentHomeHostIds() {
  return Object.keys(HOSTS);
}

export function claudeHomeDir(env = process.env, homeDir = os.homedir()) {
  return resolveHomeDir(HOSTS.claude, env, homeDir);
}

export function grokHomeDir(env = process.env, homeDir = os.homedir()) {
  return resolveHomeDir(HOSTS.grok, env, homeDir);
}

export function claudeSkillsDir(env = process.env, homeDir = os.homedir()) {
  return path.join(claudeHomeDir(env, homeDir), 'skills');
}

export function grokSkillsDir(env = process.env, homeDir = os.homedir()) {
  return path.join(grokHomeDir(env, homeDir), 'skills');
}

export function usesDefaultClaudeHome(env = process.env, homeDir = os.homedir()) {
  return usesDefaultHome(HOSTS.claude, env, homeDir);
}

export function usesDefaultGrokHome(env = process.env, homeDir = os.homedir()) {
  return usesDefaultHome(HOSTS.grok, env, homeDir);
}

function resolveHomeDir(spec, env, homeDir) {
  const configured = env?.[spec.envKey];
  if (typeof configured === 'string' && configured.trim() !== '') {
    return path.resolve(configured);
  }
  return path.resolve(homeDir, spec.defaultDirName);
}

function usesDefaultHome(spec, env, homeDir) {
  const configured = env?.[spec.envKey];
  if (typeof configured !== 'string' || configured.trim() === '') return true;
  return path.resolve(configured) === path.resolve(homeDir, spec.defaultDirName);
}

function skillsDirFor(host, env = process.env) {
  return host === 'grok' ? grokSkillsDir(env) : claudeSkillsDir(env);
}

function readHomeCatalogFloor(skillsDir) {
  const readOne = (file) => {
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      const version = typeof value?.packageVersion === 'string' ? value.packageVersion : null;
      const valid =
        value &&
        value.schemaVersion === '1.0' &&
        isValidSemver(version) &&
        Array.isArray(value.skills);
      return { exists: true, valid, version: valid ? version : null };
    } catch (error) {
      if (error && error.code === 'ENOENT') return { exists: false, valid: true, version: null };
      return { exists: true, valid: false, version: null };
    }
  };
  const catalog = readOne(path.join(skillsDir, HOME_SKILL_CATALOG));
  const pending = readOne(path.join(skillsDir, HOME_SKILL_PENDING_CATALOG));
  let floorVersion = catalog.version;
  if (pending.version && (!floorVersion || isVersionOlder(floorVersion, pending.version))) {
    floorVersion = pending.version;
  }
  return {
    floorVersion,
    pendingVersion: pending.version,
    hasMetadata: catalog.exists || pending.exists,
    metadataInvalid:
      (catalog.exists && !catalog.valid) || (pending.exists && !pending.valid),
  };
}

function homeInPlay(parity, catalogState) {
  return parity.presentCount > 0 || catalogState.hasMetadata;
}

/**
 * Detect Claude/Grok user-home ark-* catalogs that lag this package.
 * Absent homes are not debt. Stamp-only body-match is not content-behind
 * (assessSkillCatalogParity already treats identity match as current).
 *
 * @param {string} root
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Array<{
 *   host: AgentHomeHost,
 *   label: string,
 *   skillsDir: string,
 *   missing: number,
 *   stale: number,
 *   presentCount: number,
 *   expectedCount: number,
 *   packageVersion: string|null,
 *   catalogVersion: string|null,
 *   pendingRecoveryRequired: boolean,
 *   catalogMetadataInvalid: boolean,
 *   catalogStateReason: string|null,
 *   flag: string,
 * }>}
 */
export function detectAgentHomeGaps(root, env = process.env) {
  if (!fs.existsSync(path.join(root, 'AGENTS.md'))) return [];
  if (fs.existsSync(path.join(root, 'templates', 'skills'))) return [];
  const skillNames = skillTemplateNames();
  if (skillNames.length === 0) return [];
  const packageVersion = arkPackageVersion();
  const gaps = [];
  for (const host of agentHomeHostIds()) {
    const spec = HOSTS[host];
    const dir = skillsDirFor(host, env);
    const skillFile = (name) => path.join(dir, name, 'SKILL.md');
    const parity = assessSkillCatalogParity(skillNames, skillFile, packageVersion);
    const catalogState = readHomeCatalogFloor(dir);
    if (!homeInPlay(parity, catalogState)) continue;
    const newerFloor =
      catalogState.floorVersion &&
      isValidSemver(packageVersion) &&
      isVersionOlder(packageVersion, catalogState.floorVersion);
    const pendingRecoveryRequired =
      catalogState.pendingVersion !== null && !newerFloor;
    const needsAttention =
      !newerFloor &&
      (parity.missing > 0 ||
        parity.stale > 0 ||
        pendingRecoveryRequired ||
        catalogState.metadataInvalid);
    if (!needsAttention) continue;
    gaps.push({
      host,
      label: spec.label,
      skillsDir: dir,
      missing: parity.missing,
      stale: parity.stale,
      presentCount: parity.presentCount,
      expectedCount: skillNames.length,
      packageVersion,
      catalogVersion: catalogState.floorVersion,
      pendingRecoveryRequired,
      catalogMetadataInvalid: catalogState.metadataInvalid,
      catalogStateReason: catalogState.metadataInvalid
        ? 'invalid catalog metadata'
        : pendingRecoveryRequired
          ? 'interrupted catalog commit'
          : null,
      flag: spec.flag,
    });
  }
  return gaps;
}

/**
 * Claude home is loaded by Claude Code and often by Cursor. Treat both as in-session.
 * Grok home is urgent only on a Grok session (or when ARK_ACTIVE_HOST=grok).
 */
export function agentHomeConcernIsActive(host, env = process.env) {
  const active = detectActiveAgentHost(env);
  if (host === 'claude') return active === 'claude' || active === 'cursor' || !active;
  if (host === 'grok') return active === 'grok' || !active;
  return true;
}

export function agentHomeRefreshCommand(root, gap) {
  return arkCommand(
    root,
    'ark-check',
    `--install-agent-gates --skills-only ${gap.flag} --force`
  );
}

/**
 * @param {{
 *   root: string,
 *   skills?: Array<[string, string]>,
 *   version: string|null,
 *   force?: boolean,
 *   claudeHome?: boolean,
 *   grokHome?: boolean,
 *   agentHomes?: boolean,
 *   json?: boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} args
 * @returns {Array<{ host: string, results: object[] }>}
 */
export function installRequestedAgentHomes(args) {
  const env = args.env ?? process.env;
  const wantClaude = Boolean(args.claudeHome || args.agentHomes);
  const wantGrok = Boolean(args.grokHome || args.agentHomes);
  if (!wantClaude && !wantGrok) return [];
  const skills = args.skills ?? skillTemplates();
  const version = args.version ?? arkPackageVersion();
  const installed = [];
  const targets = [
    wantClaude ? { host: 'claude', spec: HOSTS.claude, dir: claudeSkillsDir(env), usesDefault: usesDefaultClaudeHome(env) } : null,
    wantGrok ? { host: 'grok', spec: HOSTS.grok, dir: grokSkillsDir(env), usesDefault: usesDefaultGrokHome(env) } : null,
  ].filter(Boolean);

  for (const target of targets) {
    if (isTempOrUpgradeRoot(args.root) && target.usesDefault) {
      if (!args.json) {
        console.log('');
        console.log(
          `${target.spec.label} home skills: skipped (temp/upgrade --root must not mutate default ~/${target.spec.defaultDirName}).`
        );
      }
      installed.push({
        host: target.host,
        skipped: true,
        reason: 'temp-root-default-home',
        results: [],
      });
      continue;
    }
    if (!args.json) {
      console.log('');
      console.log(
        `${target.spec.label} home skills (scope=home-shared; source=${version ? `arkgate@${version}` : 'arkgate@unknown'}; target=${target.dir}/<name>/SKILL.md):`
      );
      console.log(
        '  Compatibility: monotonic downgrade protection requires ArkGate 4.2.0+ writers; older packages cannot lower this catalog.'
      );
    }
    try {
      fs.mkdirSync(target.dir, { recursive: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!args.json) console.error(`  FAILED to create ${target.dir} (${message})`);
      installed.push({
        host: target.host,
        skipped: false,
        results: [{ relativePath: target.dir, status: 'failed', message }],
      });
      continue;
    }
    const results = [];
    for (const result of installSkillCatalog({
      directory: target.dir,
      skills,
      packageVersion: version,
      force: args.force,
      scope: 'home',
    })) {
      if (!args.json) console.log(skillInstallLine(result));
      results.push(result);
    }
    installed.push({ host: target.host, skipped: false, results });
  }
  return installed;
}
