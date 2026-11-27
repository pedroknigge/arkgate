/**
 * ark-check CLI flag parsing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { discoverLocalBaseRef, normalizePolicyBaseRef } from './policy-delta-io.mjs';

export function resolveDesignDeltaBaseRef(root, explicit, env = process.env) {
  const flag = typeof explicit === 'string' ? explicit.trim() : '';
  if (flag) return flag;
  const envRef = normalizePolicyBaseRef(env.ARK_POLICY_BASE_REF);
  if (envRef) return envRef;
  const githubBase = typeof env.GITHUB_BASE_REF === 'string' ? env.GITHUB_BASE_REF.trim() : '';
  if (githubBase) return `origin/${githubBase}`;
  return discoverLocalBaseRef(root) || undefined;
}

/** Opt-in local / multi-worktree cheap check. Ignored values: empty, 0, false, no, off. */
export function envFlagOn(value) {
  return /^(1|true|yes)$/i.test(String(value ?? '').trim());
}

export const LOCAL_STRICT_MERGE_MESSAGE =
  '--local cannot be combined with --strict-merge: CI stays the full fail-closed check. Use --local (or ARK_CHECK_LOCAL=1) only on the local / pre-push path.';

export const LOCAL_TREE_MODE_MESSAGE =
  '--local cannot be combined with report modes that need the whole tree (--doctor, --coverage, --plan, --report, --promote, --probe-invariants) or with --update-baseline. Use --local --base <ref> for the cheap local check.';

const PROBE_RUNNERS = ['vitest', 'jest', 'node'];

export const UPDATE_BASELINE_SCOPE_MESSAGE =
  '--update-baseline cannot be combined with a changed-files scope (--changed, --local, or a --persona that implies --changed): the baseline is a whole-tree record, and a changed-files scan would overwrite it with only that subset and delete every other frozen key. Drop the scope flag (ARK_CHECK_LOCAL=1 is ignored for a baseline update) and re-run.';

/**
 * Baseline file that suppresses frozen findings for this run, or null.
 * Explicit `--baseline` always wins. `--report` (without `--against`) applies the committed
 * `.ark-baseline.json` by default, the same file `--doctor` reads, so report, `ark status`
 * and doctor agree on what is active vs frozen.
 */
export function effectiveBaselineName(args, root, exists = fs.existsSync) {
  if (args?.baseline) return args.baseline;
  // A merge verdict (--strict / --strict-merge / --contract-diff) never inherits the
  // committed freeze implicitly: adding --report must not flip a fail-closed run to pass.
  if (!args?.report || args.against || args.strictMerge || args.contractDiff) return null;
  return exists(path.join(root, '.ark-baseline.json')) ? '.ark-baseline.json' : null;
}

export function localCheckEnvelope(args, root) {
  if (!args?.local) return {};
  return {
    local: true,
    scope: 'changed',
    analysisRoot: path.resolve(root),
  };
}

const BOOL_FLAGS = new Map([
  ['--json', 'json'], ['--strict-config', 'strictConfig'], ['--init', 'init'],
  ['--install-agent-gates', 'installAgentGates'], ['--compact', 'compact'],
  ['--force', 'force'], ['--follow-config-root', 'followConfigRoot'],
  ['--skills-only', 'skillsOnly'], ['--coverage', 'coverage'], ['--doctor', 'doctor'],
  ['--plan', 'plan'], ['--rules-inventory', 'rulesInventory'], ['--path-drift', 'pathDrift'],
  ['--sensors', 'sensors'], ['--apply', 'apply'], ['--recommend', 'recommend'],
  ['--write-plan', 'writePlan'], ['--list-policy-packs', 'listPolicyPacks'],
  ['--suggest-include', 'suggestInclude'], ['--adopt-contract', 'adoptContract'],
  ['--migrate-contract', 'migrateContract'], ['--ratchet-cores', 'ratchetCores'],
  ['--write', 'write'], ['--watch', 'watch'], ['--beginner', 'beginner'],
  ['--codex-home', 'codexHome'], ['--prune-home-duplicates', 'pruneHomeDuplicates'],
  ['--claude-home', 'claudeHome'], ['--grok-home', 'grokHome'],
  ['--antigravity-home', 'antigravityHome'], ['--migrate-commands', 'migrateCommands'],
  ['--no-cache', 'noCache'], ['--resident', 'resident'], ['--reset-origin', 'resetOrigin'],
  ['--no-archive', 'noArchive'], ['--open', 'openReport'], ['--no-open', 'noOpenReport'],
  ['--fail-on-new-smells', 'failOnNewSmells'], ['--contract-session', 'contractSession'],
  ['--contract-diff', 'contractDiff'], ['--changed', 'changed'], ['--local', 'local'],
  ['--help', 'help'], ['-h', 'help'], ['--all', 'all'], ['--version', 'version'], ['-V', 'version'],
]);

const VALUE_FLAGS = new Map([
  ['--preset', 'preset'], ['--apply-policy-pack', 'applyPolicyPack'],
  ['--policy-base', 'policyBase'], ['--policy-base-ref', 'policyBaseRef'],
  ['--policy-ack', 'policyAck'], ['--base-ref', 'baseRef'], ['--against', 'against'],
  ['--base', 'base'], ['--persona', 'persona'], ['--author', 'author'],
  ['--config', 'config'], ['--manifest', 'manifest'], ['--print-config', 'printConfig'],
  ['--tsconfig', 'tsconfig'],
]);

const DEFAULT_FALSE_KEYS = [
  'json', 'strictConfig', 'strictMerge', 'requireGates', 'init', 'installAgentGates',
  'compact', 'force', 'skillsOnly', 'failOnNewSmells', 'contractSession', 'contractDiff',
  'changed', 'local', 'failUngoverned', 'updateBaseline', 'noCache', 'resident',
  'coverage', 'migrateCommands', 'doctor', 'plan', 'pathDrift', 'sensors', 'apply',
  'recommend', 'writePlan', 'listPolicyPacks', 'watch', 'beginner', 'openReport',
  'noOpenReport', 'version', 'help', 'all', 'followConfigRoot',
];

const DEFAULT_UNDEF_KEYS = [
  'manifest', 'printConfig', 'tsconfig', 'requireWriteHook', 'tools', 'baseline',
  'policyBase', 'policyBaseRef', 'policyAck', 'baseRef', 'against', 'base',
  'persona', 'author', 'promote', 'applyPolicyPack',
];

const presentFlags = (args, pairs) =>
  pairs.filter(([key]) => Boolean(args[key])).map(([, flag]) => flag);

/**
 * `--local` / `ARK_CHECK_LOCAL=1` reuse `--changed`. Env is ignored under
 * `--strict-merge` and under full-tree report modes so CI / doctor stay whole-tree.
 */
export function applyLocalCheckMode(args, env = process.env) {
  const explicit = args.local === true;
  if (!explicit && !envFlagOn(env.ARK_CHECK_LOCAL)) return args;
  const treeModes = presentFlags(args, [
    ['doctor', '--doctor'], ['coverage', '--coverage'], ['plan', '--plan'],
    ['report', '--report'], ['promote', '--promote'],
    ['probeInvariants', '--probe-invariants'], ['updateBaseline', '--update-baseline'],
  ]);
  if (args.strictMerge) {
    if (explicit) throw new Error(LOCAL_STRICT_MERGE_MESSAGE);
    return args;
  }
  if (treeModes.length > 0) {
    if (explicit) throw new Error(LOCAL_TREE_MODE_MESSAGE);
    return args;
  }
  args.local = true;
  args.changed = true;
  return args;
}

export function parseArgs(argv, env = process.env) {
  const args = {
    root: process.cwd(),
    config: 'ark.config.json',
    ...Object.fromEntries(DEFAULT_UNDEF_KEYS.map((k) => [k, undefined])),
    ...Object.fromEntries(DEFAULT_FALSE_KEYS.map((k) => [k, false])),
  };
  const requireValue = (flag, index) => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('-')) {
      throw new Error(`Missing value for ${flag}. Run arkgate-check --help for usage.`);
    }
    return value;
  };
  const nextOptional = (index, fallback) => {
    const next = argv[index + 1];
    return next && !next.startsWith('-') ? { value: next, consumed: true } : { value: fallback, consumed: false };
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const boolKey = BOOL_FLAGS.get(arg);
    if (boolKey) {
      args[boolKey] = true;
      continue;
    }
    const valueKey = VALUE_FLAGS.get(arg);
    if (valueKey) {
      args[valueKey] = requireValue(arg, i++);
      continue;
    }
    if (arg === '--strict' || arg === '--strict-merge') {
      args.strictConfig = true;
      args.requireGates = true;
      args.strictMerge = true;
    } else if (arg === '--require-gates') {
      args.requireGates = true;
      args.strictConfig = true;
    } else if (arg === '--require-write-hook') {
      args.requireWriteHook = requireValue(arg, i++).trim().toLowerCase();
    } else if (arg === '--tools') {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        i += 1;
        args.tools = next.split(',').map((tool) => tool.trim().toLowerCase()).filter(Boolean);
      } else {
        args.tools = [];
      }
    } else if (arg === '--promote' || arg.startsWith('--promote=')) {
      const eq = arg.indexOf('=');
      if (eq > 0) {
        args.promote = arg.slice(eq + 1);
      } else {
        const opt = nextOptional(i, true);
        args.promote = opt.value;
        if (opt.consumed) i += 1;
      }
    } else if (arg === '--probe-invariants' || arg.startsWith('--probe-invariants=')) {
      const eq = arg.indexOf('=');
      if (eq > 0) {
        args.probeInvariants = arg.slice(eq + 1) || true;
      } else {
        const opt = nextOptional(i, true);
        args.probeInvariants = opt.value;
        if (opt.consumed) i += 1;
      }
    } else if (arg === '--runner') {
      const value = requireValue(arg, i++).trim().toLowerCase();
      if (!PROBE_RUNNERS.includes(value)) {
        throw new Error(`--runner must be one of ${PROBE_RUNNERS.join(', ')} (got ${JSON.stringify(value)}).`);
      }
      args.runner = value;
    } else if (arg === '--agent-homes') {
      args.agentHomes = true;
      args.codexHome = true;
      args.claudeHome = true;
      args.grokHome = true;
      args.antigravityHome = true;
    } else if (arg === '--report') {
      const opt = nextOptional(i, 'ark-report.html');
      args.report = opt.value;
      if (opt.consumed) i += 1;
    } else if (arg === '--baseline' || arg === '--update-baseline') {
      if (arg === '--update-baseline') args.updateBaseline = true;
      const opt = nextOptional(i, '.ark-baseline.json');
      args.baseline = opt.value;
      if (opt.consumed) i += 1;
    } else if (arg === '--root') {
      args.root = path.resolve(requireValue(arg, i++));
    } else {
      throw new Error(`Unknown argument: ${arg}. Run arkgate-check --help for usage.`);
    }
  }

  if (args.apply && !args.promote) {
    throw new Error(
      '--apply applies to --promote. Run `arkgate-check --promote <ruleId> --apply`; the other write surfaces use --write.'
    );
  }
  if (args.promote) {
    const shadowing = presentFlags(args, [
      ['sensors', '--sensors'],
      ['pathDrift', '--path-drift'],
      ['coverage', '--coverage'],
      ['recommend', '--recommend'],
      ['doctor', '--doctor'],
      ['plan', '--plan'],
      ['rulesInventory', '--rules-inventory'],
      ['suggestInclude', '--suggest-include'],
      ['adoptContract', '--adopt-contract'],
      ['migrateContract', '--migrate-contract'],
    ]);
    if (shadowing.length > 0) {
      throw new Error(
        `--promote cannot be combined with ${shadowing.join(', ')}: that mode answers first and --promote would silently do nothing. Run them separately.`
      );
    }
    const narrowing = presentFlags(args, [
      ['changed', '--changed'],
      ['against', '--against'],
      ['baseline', '--baseline'],
    ]);
    if (narrowing.length > 0) {
      throw new Error(
        `--promote cannot be combined with ${narrowing.join(', ')}: the promotion cost must be measured over the whole governed tree, and a narrowed or baselined scope would report an undercount as the price.`
      );
    }
  }
  assertProbeInvariantsAlone(args);
  if (args.updateBaseline && (args.changed || args.local)) {
    throw new Error(UPDATE_BASELINE_SCOPE_MESSAGE);
  }
  return applyLocalCheckMode(args, env);
}

/**
 * ADR 0039 D1: the probe runs the project's own tests in a temporary copy, so
 * it is never part of a check, the merge gate, status, or a changed-files scope.
 */
function assertProbeInvariantsAlone(args) {
  if (args.runner && !args.probeInvariants) {
    throw new Error('--runner applies to --probe-invariants. Run `arkgate-check --probe-invariants --runner <id>`.');
  }
  if (!args.probeInvariants) return;
  const gatePaths = presentFlags(args, [
    ['local', '--local'],
    ['changed', '--changed'],
    ['strictMerge', '--strict-merge'],
    ['updateBaseline', '--update-baseline'],
    ['doctor', '--doctor'],
  ]);
  if (gatePaths.length > 0) {
    throw new Error(
      `--probe-invariants cannot be combined with ${gatePaths.join(', ')}: the probe runs your tests in a temporary copy and is never part of a check, the merge gate, or status. Run it on its own.`
    );
  }
  const shadowing = presentFlags(args, [
    ['promote', '--promote'],
    ['sensors', '--sensors'],
    ['pathDrift', '--path-drift'],
    ['coverage', '--coverage'],
    ['plan', '--plan'],
    ['report', '--report'],
    ['rulesInventory', '--rules-inventory'],
    ['recommend', '--recommend'],
  ]);
  if (shadowing.length > 0) {
    throw new Error(
      `--probe-invariants cannot be combined with ${shadowing.join(', ')}: one of them would answer first and the other would silently do nothing. Run them separately.`
    );
  }
}
