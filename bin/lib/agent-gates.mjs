/**
 * Agent gate install, migrate, Codex, skills, adoption — public surface.
 * Implementation lives in focused modules under bin/lib/.
 */
export {
  assessCodexHomeMcp,
  codexArkBlockHasPreferredBin,
  codexArkBlockNeedsRewrite,
  codexConfigPath,
  codexPrimaryTable,
  codexProjectMcpIsValid,
  codexProjectSlug,
  codexPromptsDir,
  codexSkillsDir,
  codexScopedTableForRoot,
  extractCodexArkRootFromToml,
  extractCodexRootFromBlock,
  isTempOrUpgradeRoot,
  listCodexArkServerTables,
  upsertCodexMcpTable,
  wireCodexMcp,
} from './codex-home.mjs';

export {
  PREFERRED_MCP_BIN,
  claudeSettings,
  codexProjectConfig,
  grokHooks,
  grokProjectConfig,
} from './hook-templates.mjs';

export { detectWritePathCapabilities } from './write-path-detect.mjs';

export {
  ensureBaselineFlagInCheckCommand,
  syncBaselineIntoCheckSurfaces,
  pinArkgateDevDependency,
  IO_DIR_SEGMENTS,
  detectContractFalseGreenRisk,
  FALSE_GREEN_GAP_ID,
  falseGreenAdoptionGap,
} from './field-install.mjs';

export {
  readJson,
  readPackageJson,
  hasCheckArchitectureScript,
  packageScriptsHaveTypecheck,
  treeHasTypecheckScript,
  ensureTypecheckScript,
  compactRouterHost,
  REQUIRED_GATE_FILES,
  hasArkWorkflow,
  missingGates,
  ensureDirForFile,
  isArkAgentsContent,
  isSelfHostedLibraryAgents,
  writeTemplate,
} from './gate-files.mjs';

export { loadTypeScript } from './typescript-host.mjs';

export {
  checkArgsForRoot,
  packageManager,
  arkCheckCommand,
  checkArchitectureScriptSnippet,
  layerPlacementTable,
  agentInstructions,
  mcpJson,
  codexTomlSnippet,
  instructionRule,
  cursorRule,
  detectNodeMajorFromWorkflows,
  detectCiNode,
  githubWorkflow,
} from './ci-and-commands.mjs';

export {
  normalizeToolsList,
  resolveTools,
  KNOWN_TOOLS,
  SKILL_TOOL_TARGETS,
  detectActiveAgentHost,
  codexConcernIsActive,
  arkPackageVersion,
  stampSkill,
  installedSkillVersion,
  isVersionOlder,
  skillTemplates,
  skillTemplateNames,
  detectCodexHomeGap,
  detectCodexRepoSkillGap,
  assessCodexSkillParity,
  assessSkillCatalogParity,
  detectSkillGaps,
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
  detectPreCommitArk,
  detectCiEnforcement,
  classifyArkCheckFlags,
  detectConfigGateDrift,
  jobIdsThatRunArkCheck,
  isArkRequiredStatusCheck,
  reportGithubBranchProtection,
  collectWeakestLinkGaps,
} from './weakest-link.mjs';

export {
  buildManagedAssetCatalog,
  staleRunnerGateFiles,
  warnLockfileConflict,
  runMigrateCommands,
  runInstallAgentGates,
} from './install-migrate.mjs';
