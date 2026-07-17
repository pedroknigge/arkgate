/**
 * Migrate command runners and install agent-gate templates.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  arkCommand,
  detectPackageManager,
  execCommandParts,
  execRunner,
  presentLockfiles,
} from '../ark-shared.mjs';
import {
  codexPromptsDir,
  codexSkillsDir,
  codexConfigPath,
  isTempOrUpgradeRoot,
  upsertCodexMcpTable,
  usesDefaultCodexHome,
  wireCodexMcp,
} from './codex-home.mjs';
import {
  PREFERRED_MCP_BIN,
  claudeSettings,
  codexHooks,
  codexProjectConfig,
  grokHooks,
  grokProjectConfig,
} from './hook-templates.mjs';
import {
  hasCheckArchitectureScript,
  ensureTypecheckScript,
  compactRouterHost,
  writeTemplate,
} from './gate-files.mjs';
import {
  packageManager,
  agentInstructions,
  mcpJson,
  githubWorkflow,
  detectCiNode,
  cursorRule,
  instructionRule,
  compactAgentInstructions,
  codexTomlSnippet,
  arkCheckCommand,
  checkArchitectureScriptSnippet,
} from './ci-and-commands.mjs';
import {
  resolveTools,
  SKILL_TOOL_TARGETS,
  skillTemplates,
  stampSkill,
  installedSkillVersion,
  isVersionOlder,
  detectSkillGaps,
  arkPackageVersion,
  verifyHostSkillCatalog,
} from './skill-install.mjs';
import { detectDeployPathQuality } from './deploy-path.mjs';
import {
  stripMcpServerArgs,
  COMMAND_GATE_TEXT_FILES,
  COMMAND_GATE_JSON_FILES,
  PREFERRED_CHECK_BIN,
  RUNNER_BEFORE_ARK,
} from './mcp-adoption.mjs';
import {
  hasHardWriteHook,
  validateHardWriteRequest,
  validateSelectedTools,
} from './enforcement-profiles.mjs';

export function staleRunnerGateFiles(root) {
  const want = execRunner(root);
  if (want === 'npx') return [];
  const stale = [];
  for (const rel of COMMAND_GATE_TEXT_FILES) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue;
    }
    RUNNER_BEFORE_ARK.lastIndex = 0;
    let match;
    while ((match = RUNNER_BEFORE_ARK.exec(text))) {
      if (match[0] !== want) {
        stale.push(rel);
        break;
      }
    }
  }
  for (const rel of COMMAND_GATE_JSON_FILES) {
    let json;
    try {
      json = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
    } catch {
      continue;
    }
    const ark = json?.mcpServers?.ark;
    if (ark && ark.command && ark.command !== want.split(' ')[0]) stale.push(rel);
  }
  return stale;
}

// When more than one lockfile is present the project is ambiguous. detectPackageManager()
// resolves it (package-lock.json wins so a stray pnpm-lock.yaml can't hijack an npm project),
// but the user should know it happened and how to make it explicit — otherwise a leftover
// lockfile silently steers which runner every emitted command uses.
export function warnLockfileConflict(root) {
  const locks = presentLockfiles(root);
  if (locks.length <= 1) return;
  const chosen = detectPackageManager(root);
  const files = { pnpm: 'pnpm-lock.yaml', yarn: 'yarn.lock', npm: 'package-lock.json' };
  console.log('');
  console.log(
    `Note: multiple lockfiles present (${locks.map((pm) => files[pm]).join(', ')}). Treating this`
  );
  console.log(
    `as a ${chosen} project — Ark commands use "${execRunner(root)}". If that's wrong, set`
  );
  console.log(
    '"packageManager" in package.json (e.g. "pnpm@9") to declare it, or remove the stray lockfile.'
  );
}

// --migrate-commands: rewrite ONLY the Ark command runner in existing gate files to the
// project's package manager (no --force clobber). Closes the upgrade gap where a repo that
// adopted before the package-manager-aware templates keeps a stale `npx`.
// Also normalizes MCP JSON to a single preferred bin (arkgate-mcp), stripping any dual
// ark-mcp + arkgate-mcp residue left by partial renames during package identity cutover.
export function runMigrateCommands(root) {
  const runner = execRunner(root);
  const changed = [];
  for (const rel of COMMAND_GATE_TEXT_FILES) {
    const full = path.join(root, rel);
    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    let next = text.replace(RUNNER_BEFORE_ARK, runner);
    // Prefer primary product bins in command strings (aliases still work if left alone).
    next = next
      .replace(/\bark-mcp\b/g, PREFERRED_MCP_BIN)
      .replace(/\bark-check\b/g, PREFERRED_CHECK_BIN);
    // Do not blanket-replace bare `ark` — it appears in prose ("Ark check", product name).
    if (next !== text) {
      fs.writeFileSync(full, next);
      changed.push(rel);
    }
  }
  for (const rel of COMMAND_GATE_JSON_FILES) {
    const full = path.join(root, rel);
    let json;
    try {
      json = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch {
      continue;
    }
    const ark = json?.mcpServers?.ark;
    if (!ark) continue;
    const binArgs = stripMcpServerArgs(ark.args);
    const parts = execCommandParts(root, PREFERRED_MCP_BIN, binArgs);
    if (ark.command !== parts.command || JSON.stringify(ark.args) !== JSON.stringify(parts.args)) {
      json.mcpServers.ark = { ...ark, ...parts };
      fs.writeFileSync(full, `${JSON.stringify(json, null, 2)}\n`);
      changed.push(rel);
    }
  }
  const pm = runner === 'pnpm exec' || runner.startsWith('pnpm ') ? 'pnpm' : runner;
  console.log(`Migrated ArkGate command runners to "${pm}" and normalized MCP bins in gate files.`);
  if (changed.length === 0) {
    console.log('  Nothing to change — runners and MCP bins already look correct.');
  } else {
    for (const rel of changed) console.log(`  updated ${rel}`);
    console.log(
      `  (runner + single MCP bin \`${PREFERRED_MCP_BIN}\`; customized non-command content is untouched.)`
    );
  }
  warnLockfileConflict(root);
}

export function runInstallAgentGates(args) {
  const root = args.root;
  if (args.migrateCommands) {
    runMigrateCommands(root);
    return;
  }
  if (args.tools != null) {
    const selection = validateSelectedTools(args.tools);
    if (!selection.ok) {
      console.error(selection.error);
      process.exitCode = 2;
      return;
    }
    args.tools = selection.tools;
  }
  const writeRequest = validateHardWriteRequest({
    root,
    host: args.requireWriteHook,
    tools: args.tools,
    force: args.force,
  });
  if (!writeRequest.ok) {
    console.error(writeRequest.error);
    process.exitCode = 2;
    return;
  }
  if (writeRequest.host && args.tools == null) {
    args.tools = writeRequest.tools;
  }
  if (writeRequest.host && args.skillsOnly && !hasHardWriteHook(root, writeRequest.host)) {
    console.error(
      `--skills-only cannot install the requested ${writeRequest.host} hard-write hook. ` +
      'Remove --skills-only or omit --require-write-hook.'
    );
    process.exitCode = 2;
    return;
  }
  const pm = packageManager(root);
  const hasCheckScript = hasCheckArchitectureScript(root);
  const { tools, source } = args.compact && args.tools == null
    ? { tools: new Set(), source: 'compact-none' }
    : resolveTools(args);
  if (args.compact && tools.size > 1) {
    console.error('--compact accepts exactly one selected host. Pass --tools <host>.');
    process.exitCode = 2;
    return;
  }
  const toolSource =
    source === 'explicit'
      ? 'from --tools'
      : source === 'detected'
        ? 'auto-detected from config dirs'
        : source === 'compact-none'
          ? 'no active host detected'
        : 'default set — no agent config dirs found';
  console.log(`Agent gates for: ${[...tools].sort().join(', ')} (${toolSource})`);
  const templates = [];
  // --skills-only refreshes just the canonical /ark-* skills, which are safe to
  // overwrite (they track the package). The gate/instruction files (AGENTS.md,
  // settings.json, CI workflow, rules) are the ones users customize, so a plain
  // `--force` clobbers them — this is the safe way to pick up new skill versions.
  // Do not mutate package.json under --skills-only (typecheck bootstrap is gates/CI).
  if (!args.skillsOnly) {
    // Bootstrap typecheck before CI template so generated workflow includes the step.
    const typecheckBootstrap = ensureTypecheckScript(root, { write: !args.compact });
    if (typecheckBootstrap.changed && !args.compact && !args.json) {
      console.log(
        `Added package.json script "typecheck": "${typecheckBootstrap.script}" (tsconfig present; local/CI parity).`
      );
    }
    // Base gates: tool-agnostic contract + CI backstop, always written.
    const compactHost = args.compact ? [...tools][0] ?? null : null;
    templates.push([
      'AGENTS.md',
      args.compact ? compactAgentInstructions(root, compactHost) : agentInstructions(root),
    ]);
    if (!args.compact || !compactHost || compactHost === 'claude') {
      templates.push(['.mcp.json', mcpJson(root)]);
    }
    templates.push([
      '.github/workflows/ark-check.yml',
      (() => {
        const deploy = detectDeployPathQuality(root);
        return githubWorkflow(pm, detectCiNode(root), {
          hasLintScript: deploy.hasLintScript,
          hasTypecheckScript: deploy.hasTypecheckScript,
        });
      })(),
    ]);
    if (tools.has('cursor')) {
      templates.push(['.cursor/mcp.json', mcpJson(root)]);
      if (!args.compact) templates.push(['.cursor/rules/ark.mdc', cursorRule(root)]);
    }
    if (tools.has('claude')) {
      templates.push(['.claude/settings.json', claudeSettings(root)]);
    }
    if (tools.has('codex')) {
      templates.push(['.codex/hooks.json', codexHooks(root)]);
      templates.push(['.codex/config.toml', codexProjectConfig(root)]);
      if (!args.compact) templates.push(['docs/ark-codex-config.toml', codexTomlSnippet(root)]);
    }
    if (tools.has('grok')) {
      templates.push(['.grok/config.toml', grokProjectConfig(root)]);
      templates.push(['.grok/hooks/ark-write-gate.json', grokHooks(root)]);
    }
    // Instruction-tier hosts: one shared rule text, host-specific path.
    if (tools.has('windsurf')) {
      templates.push(['.windsurf/rules/ark.md', instructionRule(root)]);
    }
    if (tools.has('cline')) {
      templates.push(['.clinerules/ark.md', instructionRule(root)]);
    }
    if (tools.has('copilot')) {
      templates.push(['.github/copilot-instructions.md', instructionRule(root)]);
    }
    if (tools.has('kiro')) {
      templates.push(['.kiro/steering/ark.md', instructionRule(root)]);
    }
    if (tools.has('roo')) {
      templates.push(['.roo/rules/ark.md', instructionRule(root)]);
    }
    if (tools.has('continue')) {
      templates.push(['.continue/rules/ark.md', instructionRule(root)]);
    }
    // Gemini CLI reads GEMINI.md as its primary project context (it also reads
    // AGENTS.md, but GEMINI.md wins when both are present), so the rule lives there.
    if (tools.has('gemini')) {
      templates.push(['GEMINI.md', instructionRule(root)]);
    }
  }
  // /ark-* skills for every detected tool that supports project-level commands.
  // Stamp each with the shipping version so a later ark-check can flag skills
  // left behind by an older Ark (see detectSkillGaps) without nagging about
  // user edits to the body.
  const version = arkPackageVersion();
  const skills = skillTemplates().map(([name, content]) => [name, stampSkill(content, version)]);
  const skillPaths = new Set();
  if (!args.compact) {
    for (const tool of tools) {
      const target = SKILL_TOOL_TARGETS[tool];
      if (!target) continue;
      for (const [name, content] of skills) {
        const relativePath = target(name);
        skillPaths.add(relativePath);
        templates.push([relativePath, content]);
      }
    }
  }

  // A compact router can be moved back from an explicit host removal. Delete the
  // generic MCP file only when it exactly matches Ark's generated artifact.
  const priorCompactHost = compactRouterHost(root);
  if (args.compact && priorCompactHost === 'none' && [...tools][0]) {
    const genericMcp = path.join(root, '.mcp.json');
    try {
      if (fs.readFileSync(genericMcp, 'utf8') === mcpJson(root)) fs.rmSync(genericMcp);
    } catch {
      // Missing or customized user MCP configuration is deliberately retained.
    }
  }

  const results = templates.map(([relativePath, content]) => {
    if (relativePath === '.codex/config.toml') {
      const fullPath = path.join(root, relativePath);
      let existing = '';
      try {
        existing = fs.readFileSync(fullPath, 'utf8');
      } catch {
        // A missing project config starts from the generated Ark table.
      }
      const tableStart = content.indexOf('[mcp_servers.ark]');
      const generatedPrelude = tableStart > 0 ? content.slice(0, tableStart) : '';
      const mergeBase = generatedPrelude ? existing.replace(generatedPrelude, '') : existing;
      const merged = upsertCodexMcpTable(mergeBase, 'ark', content);
      if (merged === existing) return { relativePath, status: 'skipped' };
      return writeTemplate(root, relativePath, merged, true);
    }
    return writeTemplate(
      root,
      relativePath,
      content,
      args.force || (args.compact && relativePath === 'AGENTS.md' && priorCompactHost !== null)
    );
  });

  console.log('Ark agent gate templates:');
  let staleSkipped = 0;
  for (const result of results) {
    const marker =
      result.status === 'written'
        ? 'wrote'
        : result.status === 'merged'
          ? 'merged'
          : result.status === 'skipped-non-ark'
            ? 'kept'
            : result.status === 'failed'
              ? 'FAILED'
              : 'skipped';
    // A skipped skill reads as "you're fine" — but it may be a version behind.
    // Say which, so the user isn't left guessing (and knows the safe refresh cmd).
    let note = '';
    if (result.status === 'skipped' && skillPaths.has(result.relativePath) && version) {
      const installed = installedSkillVersion(path.join(root, result.relativePath));
      if (installed === null || isVersionOlder(installed, version)) {
        staleSkipped += 1;
        note = `  (stale: ${installed ?? 'no stamp'} < ${version})`;
      } else {
        note = '  (up to date)';
      }
    }
    console.log(`  ${marker.padEnd(7)} ${result.relativePath}${note}`);
  }
  if (staleSkipped > 0 && !args.skillsOnly) {
    console.log('');
    console.log(
      `  ${staleSkipped} skill(s) are outdated but were left untouched. Refresh them with:`
    );
    console.log(`    ${arkCommand(root, 'ark-check', '--install-agent-gates --skills-only --force')}`);
  }

  // --codex-home writes SKILL.md skills to $CODEX_HOME/skills/<name>/SKILL.md.
  // Codex's real catalog loads skill directories (not flat $CODEX_HOME/prompts).
  // Repo installs already write `.agents/skills/<name>/SKILL.md` when `codex` is
  // selected; home install is for multi-project / non-repo-local refresh.
  const homeResults = [];
  if (args.codexHome) {
    const dir = codexSkillsDir();
    console.log('');
    console.log(`Codex home skills (${dir}/<name>/SKILL.md):`);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      console.error(`  FAILED to create ${dir} (${error.message})`);
      homeResults.push({ status: 'failed' });
    }
    if (homeResults.length === 0) {
      for (const [name, content] of skills) {
        const skillDir = path.join(dir, name);
        const file = path.join(skillDir, 'SKILL.md');
        if (fs.existsSync(file) && !args.force) {
          const installed = installedSkillVersion(file);
          const behind = installed === null || (version && isVersionOlder(installed, version));
          const note = behind
            ? `  (stale: ${installed ?? 'no stamp'} < ${version}; use --force)`
            : '  (up to date)';
          console.log(`  ${'skipped'.padEnd(7)} ${name}/SKILL.md${note}`);
          homeResults.push({ status: 'skipped' });
          continue;
        }
        try {
          fs.mkdirSync(skillDir, { recursive: true });
          fs.writeFileSync(file, content);
          console.log(`  ${'wrote'.padEnd(7)} ${name}/SKILL.md`);
          homeResults.push({ status: 'written' });
        } catch (error) {
          console.log(`  ${'FAILED'.padEnd(7)} ${name}/SKILL.md (${error.message})`);
          homeResults.push({ status: 'failed' });
        }
      }
    }
  }

  // Optional legacy/home fallback. Normal Codex installs use the project-scoped
  // .codex/config.toml above, avoiding cross-project primary binding conflicts.
  //
  // Skip home MCP mutation when the project root is a temp/upgrade scratch *and*
  // CODEX_HOME is the default (~/.codex). Fixtures and agent smokes must not rewrite
  // the developer's real config.toml with a temp --root. --codex-home still refreshes
  // home *skills* below; MCP binding of a temp root into default home is never safe.
  // A redirected CODEX_HOME (tests/isolation) may still wire as requested.
  let codexMcp = null;
  const wantCodexWire = !args.compact && !args.skillsOnly && args.codexHome;
  const skipHomeWire =
    wantCodexWire && isTempOrUpgradeRoot(root) && usesDefaultCodexHome();
  if (wantCodexWire && !skipHomeWire) {
    codexMcp = wireCodexMcp(root, args.force);
    console.log('');
    console.log(`Codex MCP registration (${codexMcp.file}):`);
    if (codexMcp.status === 'written-multi') {
      console.log(
        `  ${'wrote'.padEnd(7)} [mcp_servers.${codexMcp.table}] (multi-project — primary [mcp_servers.ark] left unchanged; --force rebinds primary)`
      );
    } else if (codexMcp.status === 'skipped') {
      console.log(`  ${'skipped'.padEnd(7)} [mcp_servers.ark] already present (use --force to overwrite)`);
    } else if (codexMcp.status === 'failed') {
      console.log(`  ${'FAILED'.padEnd(7)} [mcp_servers.ark] (${codexMcp.message})`);
    } else {
      const verb = codexMcp.status === 'updated' ? 'updated' : 'wrote';
      console.log(`  ${verb.padEnd(7)} [mcp_servers.ark] with absolute paths`);
      console.log('          RESTART Codex — it does not hot-load MCP servers.');
      console.log('          Then expect: resource ark://manifest + tools validate_code, ark_check, ark_coverage, ark_place.');
    }
  } else if (skipHomeWire) {
    codexMcp = { status: 'skipped', file: codexConfigPath(), reason: 'temp-root' };
  }

  // Repo templates + explicit --codex-home skill writes are hard failures.
  // Home MCP wire is best-effort: unreadable ~/.codex (sandbox, permissions) must not
  // mark an otherwise successful repo gate install as failed.
  const hardFailed = [...results, ...homeResults].filter((result) => result.status === 'failed');
  if (hardFailed.length > 0) {
    console.error(`\nFailed to write ${hardFailed.length} template(s).`);
    process.exitCode = 1;
    return;
  }
  if (codexMcp?.status === 'failed') {
    console.error(
      `\nWarning: Codex home MCP registration failed (${codexMcp.message}). Repo gates were written; fix ~/.codex access or re-run with --codex-home --force.`
    );
  }
  if (writeRequest.host) {
    if (!hasHardWriteHook(root, writeRequest.host)) {
      console.error(`\nFailed to verify the ${writeRequest.host} hard-write hook after install.`);
      process.exitCode = 1;
      return;
    }
    console.log(`\nHard-write hook verified for ${writeRequest.host}.`);
  }
  console.log('');
  console.log('Next steps:');
  console.log('  1. Review the generated files and commit the ones that match your tools.');
  console.log(`  2. Run: ${arkCheckCommand(root)}`);
  if (!hasCheckScript) {
    console.log('  3. Add the package.json alias if you want `run check:architecture`:');
    console.log(`     ${checkArchitectureScriptSnippet(root)}`);
  }
  if ((tools.has('codex') || args.codexHome)) {
    console.log('');
    if (codexMcp && codexMcp.status !== 'failed') {
      console.log(`  Codex: ark MCP registered in ${codexMcp.file} — restart Codex so \`ark://manifest\` loads.`);
    }
    if (tools.has('codex') && !args.compact) {
      console.log('  Codex write path (honest):');
      console.log('    - Local: advisory MCP + best-effort .codex/hooks.json (not a hard boundary).');
      console.log('    - Hard merge backstop: CI --strict-merge + required status check.');
      console.log('    - Not equivalent to Claude/Grok PreToolUse hard-write + repair.');
    }
    if (args.codexHome) {
      console.log(
        `  Codex: refreshed home skills under ${codexSkillsDir()}/<name>/SKILL.md (Codex skill catalog).`
      );
    } else if (tools.has('codex') && skills.length > 0 && !args.compact) {
      console.log(
        '  Codex: project skills at `.agents/skills/<name>/SKILL.md` (Agent Skills REPO scope).'
      );
      console.log(
        `  Optional multi-project home copy: ${arkCommand(root, 'ark-check', '--install-agent-gates --codex-home')}`
      );
      console.log(
        `  (writes $CODEX_HOME/skills; legacy flat prompts at ${codexPromptsDir()} are not the skill catalog).`
      );
      // Best-effort note when dead prompts still sit under the repo.
      try {
        const promptDir = path.join(root, '.codex', 'prompts');
        if (fs.existsSync(promptDir)) {
          const legacy = fs.readdirSync(promptDir).filter((n) => /^ark-[a-z0-9-]+\.md$/.test(n));
          if (legacy.length > 0) {
            console.log(
              `  Note: ignoring ${legacy.length} legacy .codex/prompts/ark-*.md file(s) — not loadable as Codex skills.`
            );
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // Post-install: AGENTS.md /ark-* refs must exist in each selected host catalog.
  // Compact routers intentionally omit those refs (package/MCP is the router).
  if (!args.compact && skills.length > 0) {
    const catalog = verifyHostSkillCatalog(root, tools, {
      skillNames: skills.map(([name]) => name),
    });
    if (!catalog.ok) {
      console.log('');
      console.error(
        `Skill catalog verification failed: ${catalog.missing.length} AGENTS.md /ark-* reference(s) missing from host catalogs.`
      );
      for (const miss of catalog.missing.slice(0, 12)) {
        console.error(`  missing ${miss.tool}: ${miss.path}`);
      }
      if (catalog.missing.length > 12) {
        console.error(`  …and ${catalog.missing.length - 12} more`);
      }
      process.exitCode = 1;
      return;
    }
    if (catalog.checkedTools.length > 0 && catalog.referenced.length > 0) {
      console.log('');
      console.log(
        `Skill catalog verified: ${catalog.referenced.length} AGENTS.md /ark-* skill(s) present for ${catalog.checkedTools.join(', ')}.`
      );
    }
  }
  warnLockfileConflict(root);
}
