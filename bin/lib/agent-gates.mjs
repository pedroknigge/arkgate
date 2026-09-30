/**
 * Agent gate install, migrate, Codex, skills, adoption — public surface.
 * Implementation lives in focused modules under bin/lib/.
 */
export {
  isTempOrUpgradeRoot,
  wireCodexMcp,
} from './codex-home.mjs';

export {
  claudeSettings,
  grokHooks,
} from './hook-templates.mjs';

export { detectWritePathCapabilities } from './write-path-detect.mjs';

export {
  readJson,
  hasCheckArchitectureScript,
  ensureTypecheckScript,
  compactRouterHost,
  REQUIRED_GATE_FILES,
  missingGates,
  isArkAgentsContent,
  isSelfHostedLibraryAgents,
  writeTemplate,
} from './gate-files.mjs';

export { loadTypeScript } from './typescript-host.mjs';

export {
  arkCheckCommand,
  checkArchitectureScriptSnippet,
  agentInstructions,
  githubWorkflow,
} from './ci-and-commands.mjs';

export {
  normalizeToolsList,
  resolveTools,
  SKILL_TOOL_TARGETS,
  detectActiveAgentHost,
  codexConcernIsActive,
  arkPackageVersion,
  stampSkill,
  installedSkillVersion,
  skillTemplates,
  skillTemplateNames,
  detectCodexHomeGap,
  detectCodexRepoSkillGap,
  assessCodexSkillParity,
  assessSkillCatalogParity,
  detectSkillGaps,
  skillGapsForActiveHost,
  skillGapToolLabel,
  agentsMdSkillRefs,
  verifyHostSkillCatalog,
  printSkillAndCodexGapHints,
} from './skill-install.mjs';

export { detectDeployPathQuality } from './deploy-path.mjs';

export {
  stripMcpServerArgs,
  mcpArgsHaveDuplicateBins,
  brokenMcpGateFiles,
  collectAdoptionGaps,
} from './mcp-adoption.mjs';

export {
  detectCiEnforcement,
  classifyArkCheckFlags,
  collectWeakestLinkGaps,
} from './weakest-link.mjs';

export {
  staleRunnerGateFiles,
  warnLockfileConflict,
  runMigrateCommands,
  runInstallAgentGates,
} from './install-migrate.mjs';
