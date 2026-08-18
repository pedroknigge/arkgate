/**
 * First-run CLI help (setup + check). Encyclopedia text stays behind --help --all.
 */

export function setupUsage() {
  return `arkgate (alias ark) — One architecture config. One check. One coach.

  arkgate start              preview what will change (no writes)
  arkgate start --apply      write the compact contract + host router + CI
  arkgate-check --doctor     status light + primary next action

Then session 0 in your agent: /ark-adopt
Stuck? Run doctor. Do #1.

More commands and flags: arkgate --help --all
`;
}

export function upgradeUsage() {
  return `arkgate upgrade (alias ark upgrade) — preview vs apply.

  arkgate upgrade            preview managed updates (no writes)
  arkgate upgrade --apply    apply the previewed bytes (needs --plan-digest when applying managed files)

Customized files stay unless you pass --accept-conflicts or --refresh-skills.
Then: arkgate-check --doctor

Every flag: arkgate --help --all
`;
}

export function setupUsageAll() {
  return `arkgate (alias ark) — One architecture config. One check. One coach.

Usage:
  arkgate start   [--root <project>] [--tools <host>] [--require-write-hook <host>] [--install] [--apply] [--json]
  arkgate init    [--root <project>] [--preset hexagonal|layered|feature-sliced|monorepo|ui-surface|vertical-slice|ddd-bounded-contexts|clean-architecture|onion-architecture]
              [--archetype <playbook-id>] [--tools <list>] [--require-write-hook <host>] [--yes] [--force] [--no-strict]
  arkgate upgrade [--root <project>] [--tools <list>] [--apply] [--plan-digest <sha256>] [--accept-conflicts] [--refresh-skills] [--json] [--no-install] [--no-strict]
  arkgate preflight --changes <change-set.json> [--change-map <map.json>] [--root <project>] [--config ark.config.json] [--manifest <manifest.json>] [--tsconfig <tsconfig.json>] [--json]
  arkgate status  [--root <project>] [--config ark.config.json] [--json] [--vs <git-ref>]
              [--expected-root <abs>] [--expected-project-id sha256:…] [--tools <host>]
  arkgate agents-md [--root <project>] [--config ark.config.json] [--write] [--check] [--stdout] [--json]
                [--tools <host>]

Commands:
  start     New here? Analyze and preview the complete setup. Read-only unless --apply.
  init      Configure Ark project enforcement with explicit prompts.
  upgrade   Preview identity-proven Ark-managed asset updates. With package install,
            --apply bumps toward registry latest when behind (not only when CLI ≠ pin)
            and recomputes the preview; a second explicit --apply --no-install applies
            those exact bytes and verifies them. --refresh-skills opts in to rewrite
            customized managed skills to package templates (never silent default).
            (alias: ark update)
  preflight Validate one atomic create/update/delete set without writing project files.
  status    Unified session/project manifest (identity, activation, last check, rules).
            Never prompts. Prefer --json for agents; CI=1 forces JSON.
  agents-md Version-matched agent contract projection (ACS04). Stamps package version +
            contract summary into a managed AGENTS.md block. Non-authoritative — not a
            gate input. Preview by default; --write merges without clobbering outside
            regions; --check fails on version drift; --stdout prints the block only.
            (aliases: agents-md, agent-projection)

Options:
  --yes        Non-interactive defaults: create config if needed, install gate templates, run strict check.
               (Also the implicit default when stdin/stdout are not a TTY — agents never hang on prompts.)
  --force      Allow generated files to overwrite existing files.
  --no-strict  Skip the final strict ark-check run.
  --install    Pin and install arkgate as a project devDependency (default for start).
  --no-install Skip adding/installing arkgate as a project devDependency (start/upgrade).
  --apply       Apply a start plan; for upgrade, update/repreview or apply managed bytes.
  --accept-conflicts
                Allow upgrade to recreate deleted managed assets or replace recorded conflicts.
  --plan-digest Digest emitted by an upgrade preview; required to apply managed bytes.
  --json        Emit the start/upgrade/status/agents-md preview as deterministic machine-readable JSON.
  --write       For agents-md: merge the version-matched projection into AGENTS.md.
  --check       For agents-md: exit 1 when projection stamp drifts from package version.
  --stdout      For agents-md: print the projection block only (no file write).
  --expected-root / --expected-project-id
                Optional project expectation for status (MCP-compatible binding check).
  --preset     Start from a named architecture preset instead of detection.
  --archetype  Application shape from templates/architecture-playbook.json (maps to the matching preset).
               Valid ids: crud-product, api-backend, frontend-surface, library-sdk, cli-utility,
               worker-pipeline, event-coordinator, integration-bridge, multi-app-workspace, prototype-spike,
               vertical-slice-product, ddd-bounded-contexts.
  --tools      One active agent host for start (claude,cursor,codex,grok,windsurf,cline,copilot,kiro,roo,continue,gemini).
               Omit to use the active host; an unknown host creates only the shared compact router.
  --remove-host <host>
               Preview or apply removal of that compact host integration; re-add it with --tools <host>.
  --require-write-hook <host>
               Require and verify a hard local write hook for Claude, Grok, Antigravity, Cursor, or Codex.
               Codex covers complete local apply_patch only; OpenCode is advisory-write plus hard CI merge.

Interactive mode (TTY, no --yes): asks what application shape you are building and maps it to a preset.
Non-interactive (no TTY): uses the same defaults as --yes — never calls readline on a null interface.
`;
}

export function checkUsage() {
  return [
    'arkgate-check (alias ark-check) — the architecture check.',
    '',
    '  arkgate-check --doctor         where you are: one status light, one next action',
    '  arkgate-check --strict-merge   CI / merge gate (required GitHub status)',
    '',
    'Every flag and command: arkgate-check --help --all',
  ].join('\n');
}

export function checkUsageAll() {
  return [
    'arkgate-check (alias ark-check) — the architecture check.',
    '',
    'Usage: arkgate-check | ark-check  (identical bins; product name ArkGate)',
    '       arkgate-check --version',
    '       arkgate-check --root <project> --config <ark.config.json> [--manifest <ark.manifest.json>] [--tsconfig <tsconfig.json>] [--strict-merge | --strict | --strict-config] [--policy-base <file> | --policy-base-ref <git-ref>] [--policy-ack <file>] [--fail-on-new-smells --base-ref <git-ref>] [--contract-diff] [--contract-session] [--changed] [--against <git-ref>] [--base <git-ref>] [--persona touch|contributor|agent|steward] [--author <id>] [--require-gates] [--require-write-hook <host>] [--json] [--baseline [file]] [--report [file.html]] [--no-cache]',
    '       ark-check --doctor [--json] [--resident] [--fail-on-new-smells --base-ref <git-ref>]  read-only diagnosis; resident JSON falls back cold',
    '       ark-check --coverage [--json]          per-layer file counts + full unclassified list (report only, exit 0)',
    '       ark-check --plan [--json]              classified remediation plan (mechanical-safe / judgment / deferred) + goal; report only',
    '       ark-check --rules-inventory [--json]   brownfield rules inventory (AR13; deterministic candidates, not a score)',
    '       ark-check --recommend [--json] [--write-plan]  application-shape plan; --write-plan emits ark-adoption-plan.json',
    '       ark-check --list-policy-packs            enthusiast packs (hexagonal, layered, feature-sliced, monorepo, ui-surface, vertical-slice, ddd-bounded-contexts)',
    '       ark-check --apply-policy-pack <id> [--force]  write ark.config.json from templates/policy-packs/ (uses preset factory)',
    '       ark-check --suggest-include [--json]   propose include roots (TS packages / workspaces)',
    '       ark-check --adopt-contract [--write]   expand include + layer patterns from ungoverned dirs (never bare lib→Presentation)',
    '       ark-check --migrate-contract [--write] additive P0-A retrofit: inject app/api/** → Application when missing',
    '       ark-check --ratchet-cores              when raw graph is green (0 violations; baseline ignored), set optional:false on populated cores only (writes ark.config.json)',
    '       ark-check --watch                      re-run the check when governed files change (debounced)',
    '       ark-check --report [file.html] [--beginner] [--reset-origin] [--no-archive] [--open|--no-open]',
    '           HTML report + snapshots under .ark/reports/ (origin once, latest each run, history JSON)',
    '           Best-effort open in browser (local TTY). No-op if open fails. --no-open / ARK_NO_OPEN_REPORT=1 to skip; --open forces open.',
    '       ark-check --init [--preset hexagonal|layered|feature-sliced|monorepo|ui-surface|vertical-slice|ddd-bounded-contexts|vite-vercel-spa|clean-architecture|onion-architecture] [--force] [--follow-config-root]',
    '       --follow-config-root  On writes (init/install-agent-gates/migrate --write/…), adopt walked-up monorepo config root (default: keep explicit --root)',
    '       ark-check --install-agent-gates [--tools claude,cursor,codex,grok] [--require-write-hook <host>] [--skills-only] [--codex-home] [--claude-home] [--grok-home] [--agent-homes] [--force]',
    '       ark-check --update-baseline [file]     freeze current violations (default .ark-baseline.json)',
    '       ark-check --print-config eleven-layer',
    '',
    'Adopting Ark in an existing codebase? Run --update-baseline once to freeze existing',
    'violations, commit the baseline file, and gate CI with --baseline: only NEW violations',
    'fail the check, so the ratchet only moves toward zero.',
    '',
    'Team parliament: law files (ark.config / arkrules / .ark-baseline.json) cannot ship in',
    'the same diff as product source. --changed --base <ref> checks touched files only.',
    '--against <ref> ratchets new keys vs that ref\'s baseline. --contract-session is a',
    'steward law-only PR. Loosen / baseline-grow need stewards[] + --author when set.',
    '',
    '--init scans the project for the built-in layer directory conventions (src/domain,',
    'src/application, src/adapters/persistence, ...) and writes an ark.config.json covering',
    'only the layers that actually exist, with the default rules filtered to those layers.',
    'Undetected profile layers are printed as suggestions with their conventional',
    'directories. When nothing is detected, the full 11-layer starter profile is written',
    'instead (all layers optional, anchored at src/), so the strict check passes today and',
    'each layer starts being enforced as soon as its directory gains source files.',
    '',
    'Resolves relative, tsconfig path-alias, and package imports via the TypeScript',
    'module resolver, then checks each resolved cross-layer import against the rules.',
    'Path aliases resolve against the NEAREST tsconfig.json above each source file, so',
    'monorepo packages with per-package configs work under a single --root. Pass',
    '--tsconfig to force one config for every file. If no tsconfig is found, path',
    'aliases are unavailable but relative/package imports still resolve.',
    '',
    'The correctness path resolves and parses one complete candidate on every invocation.',
    'Legacy node_modules/.cache/ark-check.json files are ignored. --no-cache remains an',
    'accepted compatibility no-op; the identity-keyed warm snapshot is introduced in Z07.',
    '',
    'Config shape:',
    '{',
    '  "include": ["src"],',
    '  // optional: "exclude": ["**/vendor/**"], "excludeGenerated": false  (default skips *.gen.ts / *.generated.ts)',
    '  "layers": [',
    '    { "name": "DomainModel", "patterns": ["src/domain/**"], "intentPrefixes": ["Domain."],',
    '      "forbiddenGlobals": ["fetch", "process", "Date.now", "Math.random"] }',
    '  ],',
    '  "rules": [{ "from": "DomainModel", "to": "PersistenceAdapters", "allowed": false }]',
    '}',
    '',
    'Config warnings are advisory by default and are included in JSON output.',
    'Use --strict-config to make config warnings fail the check.',
    'Use --strict-merge for the fail-closed CI profile: --strict-config + --require-gates',
    'plus the security diagnostics surfaced by doctor. --strict is a compatibility alias.',
    'This merge profile never depends on an editor/agent hook.',
    'When a Git merge base is available, --strict-merge classifies the ark.config.json',
    'transition. Weakening or judgment-required findings fail unless --policy-ack names',
    'every finding and is bound to both policy hashes. Use --policy-base/--policy-base-ref',
    'for an explicit comparison; ARK_POLICY_BASE_REF is the CI environment equivalent.',
    'Add --require-write-hook claude|grok|antigravity|cursor|codex to validate a hard local',
    'write boundary for that specific host. Codex covers complete local apply_patch only;',
    'hosted/specialized/direct-write paths and OpenCode remain CI-backed. Merge blocking requires',
    'repository policy to make the shared CI status required.',
    '',
    '--require-gates implies --strict-config and fails when the Ark contract in AGENTS.md,',
    'the project-rooted Ark server in .mcp.json, or fail-closed CI is missing/invalid.',
    'Included but unclassified source files therefore stay red instead of false-green.',
    '',
    '--install-agent-gates writes AGENTS.md, .mcp.json, and the CI workflow for every',
    'project, plus tool-specific templates. Known tools: claude, cursor, codex, grok',
    '(Claude/Grok/Antigravity/Cursor hard-write hooks when covered; Codex hard local apply_patch;',
    'shared CI check for all) and',
    'windsurf, cline, copilot, kiro, roo, continue, gemini',
    '(instruction-tier rule files derived from the same contract).',
    'It also installs the /ark-* skills shipped in templates/skills/ into each',
    'detected tool\'s command location (.claude/skills/, .cursor/commands/,',
    '.agents/skills/ (Codex REPO catalog), .grok/skills/, .windsurf/workflows/,',
    '.clinerules/workflows/, .github/prompts/).',
    'Kiro, Roo, Continue, and Gemini have no command mechanism and receive only their',
    'rule file. Existing files are never overwritten without --force, so re-running',
    'after an update only adds what is missing. --skills-only restricts the write to',
    'just the /ark-* skills (safe to --force-refresh — it leaves a customized AGENTS.md,',
    'settings, and CI workflow untouched).',
    'Pass --tools to pick which tool configs to write; otherwise they are auto-detected',
    'from their config directories (.claude/, .cursor/, .codex/, .grok/, .windsurf/,',
    '.clinerules/, .kiro/, .roo/, .continue/, .gemini/; copilot is explicit-only).',
    'claude+cursor+codex+grok are written when nothing is detected.',
    '',
    'Generate a starter 11-layer config:',
    '  ark-check --print-config eleven-layer > ark.config.json',
    '',
    'Install agent + CI enforcement templates:',
    '  ark-check --install-agent-gates',
  ].join('\n');
}
