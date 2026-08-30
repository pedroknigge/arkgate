/**
 * ark-check CLI flag parsing.
 */
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

export function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    config: 'ark.config.json',
    manifest: undefined,
    printConfig: undefined,
    tsconfig: undefined,
    json: false,
    strictConfig: false,
    strictMerge: false,
    requireGates: false,
    requireWriteHook: undefined,
    init: false,
    installAgentGates: false,
    compact: false,
    tools: undefined,
    force: false,
    skillsOnly: false,
    baseline: undefined,
    policyBase: undefined,
    policyBaseRef: undefined,
    policyAck: undefined, failOnNewSmells: false, baseRef: undefined,
    contractSession: false,
    contractDiff: false,
    changed: false,
    against: undefined,
    base: undefined,
    persona: undefined,
    author: undefined,
    failUngoverned: false,
    updateBaseline: false,
    noCache: false,
    resident: false,
    coverage: false,
    migrateCommands: false,
    doctor: false,
    plan: false,
    pathDrift: false,
    recommend: false,
    writePlan: false,
    listPolicyPacks: false,
    applyPolicyPack: undefined,
    watch: false,
    beginner: false,
    openReport: false,
    noOpenReport: false,
    version: false,
    help: false,
    all: false,
    followConfigRoot: false,
  };
  const requireValue = (flag, index) => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('-')) {
      throw new Error(`Missing value for ${flag}. Run arkgate-check --help for usage.`);
    }
    return value;
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--strict' || arg === '--strict-merge') {
      args.strictConfig = true;
      args.requireGates = true;
      args.strictMerge = true;
    }
    else if (arg === '--strict-config') args.strictConfig = true;
    else if (arg === '--require-gates') {
      args.requireGates = true;
      args.strictConfig = true;
    }
    else if (arg === '--require-write-hook') {
      args.requireWriteHook = requireValue(arg, i++).trim().toLowerCase();
    }
    else if (arg === '--init') args.init = true;
    else if (arg === '--preset') args.preset = requireValue(arg, i++);
    else if (arg === '--install-agent-gates') args.installAgentGates = true;
    else if (arg === '--compact') args.compact = true;
    else if (arg === '--tools') {
      // Consume the next arg only when it isn't another flag (same rule as --baseline),
      // so `--tools --force` can't silently eat --force as a "tool name".
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        i += 1;
        args.tools = next
          .split(',')
          .map((tool) => tool.trim().toLowerCase())
          .filter(Boolean);
      } else {
        args.tools = []; // flag without a value — rejected in runInstallAgentGates
      }
    }
    else if (arg === '--force') args.force = true;
    else if (arg === '--follow-config-root') args.followConfigRoot = true;
    else if (arg === '--skills-only') args.skillsOnly = true;
    else if (arg === '--coverage') args.coverage = true;
    else if (arg === '--doctor') args.doctor = true;
    else if (arg === '--plan') args.plan = true;
    else if (arg === '--rules-inventory') args.rulesInventory = true;
    else if (arg === '--path-drift') args.pathDrift = true;
    else if (arg === '--recommend') args.recommend = true;
    else if (arg === '--write-plan') args.writePlan = true;
    else if (arg === '--list-policy-packs') args.listPolicyPacks = true;
    else if (arg === '--apply-policy-pack') args.applyPolicyPack = requireValue(arg, i++);
    else if (arg === '--suggest-include') args.suggestInclude = true;
    else if (arg === '--adopt-contract') args.adoptContract = true;
    else if (arg === '--migrate-contract') args.migrateContract = true;
    else if (arg === '--ratchet-cores') args.ratchetCores = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--watch') args.watch = true;
    else if (arg === '--beginner') args.beginner = true;
    else if (arg === '--codex-home') args.codexHome = true;
    else if (arg === '--prune-home-duplicates') args.pruneHomeDuplicates = true;
    else if (arg === '--claude-home') args.claudeHome = true;
    else if (arg === '--grok-home') args.grokHome = true;
    else if (arg === '--agent-homes') {
      args.agentHomes = true;
      args.codexHome = true;
      args.claudeHome = true;
      args.grokHome = true;
    }
    else if (arg === '--migrate-commands') args.migrateCommands = true;
    else if (arg === '--no-cache') args.noCache = true;
    else if (arg === '--resident') args.resident = true;
    else if (arg === '--report') {
      const next = argv[i + 1];
      args.report = next && !next.startsWith('-') ? argv[++i] : 'ark-report.html';
    }
    else if (arg === '--reset-origin') args.resetOrigin = true;
    else if (arg === '--no-archive') args.noArchive = true;
    else if (arg === '--open') args.openReport = true;
    else if (arg === '--no-open') args.noOpenReport = true;
    else if (arg === '--baseline' || arg === '--update-baseline') {
      if (arg === '--update-baseline') args.updateBaseline = true;
      // optional path value: consume the next arg only when it isn't another flag
      const next = argv[i + 1];
      args.baseline = next && !next.startsWith('-') ? argv[++i] : '.ark-baseline.json';
    }
    else if (arg === '--policy-base') args.policyBase = requireValue(arg, i++);
    else if (arg === '--policy-base-ref') args.policyBaseRef = requireValue(arg, i++);
    else if (arg === '--policy-ack') args.policyAck = requireValue(arg, i++); else if (arg === '--fail-on-new-smells') args.failOnNewSmells = true; else if (arg === '--base-ref') args.baseRef = requireValue(arg, i++);
    else if (arg === '--contract-session') args.contractSession = true;
    else if (arg === '--contract-diff') args.contractDiff = true;
    else if (arg === '--changed') args.changed = true;
    else if (arg === '--against') args.against = requireValue(arg, i++);
    else if (arg === '--base') args.base = requireValue(arg, i++);
    else if (arg === '--persona') args.persona = requireValue(arg, i++);
    else if (arg === '--author') args.author = requireValue(arg, i++);
    else if (arg === '--root') args.root = path.resolve(requireValue(arg, i++));
    else if (arg === '--config') args.config = requireValue(arg, i++);
    else if (arg === '--manifest') args.manifest = requireValue(arg, i++);
    else if (arg === '--print-config') args.printConfig = requireValue(arg, i++);
    else if (arg === '--tsconfig') args.tsconfig = requireValue(arg, i++);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--all') args.all = true;
    else if (arg === '--version' || arg === '-V') args.version = true;
    else throw new Error(`Unknown argument: ${arg}. Run arkgate-check --help for usage.`);
  }
  return args;
}
