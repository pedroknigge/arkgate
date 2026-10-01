/** Stable importable surface for the ArkGate architecture product. */
export { version } from './version';

export * from './kernel/sharedPublicSurface';

export {
  ADAPTER_DIAGNOSTIC_DOCS_RELATIVE_PATH,
  adapterDocsCodePath,
  adapterFindingOccurrenceTargetKeys,
  adapterFindingRefFromTargetKey,
  adapterFindingTargetKey,
} from './domain/adapterContract';

export {
  ARK_PROJECT_IDENTITY_SCHEMA_VERSION,
  ARK_PROJECT_IDENTITY_SCHEMA_URL,
  ARK_PROJECT_IDENTITY_SCHEMA,
  PROJECT_EXPECTATION_SCHEMA,
  PROJECT_BINDING_SCHEMA,
  createProjectId,
  createProjectIdentity,
  type ProjectIdentity,
  type ProjectExpectation,
  type ProjectBinding,
} from './domain/projectIdentity';

export {
  ARK_CONFIG_SCHEMA,
  ARK_CONFIG_SCHEMA_VERSION,
  loadArkConfigContract,
  parseArkConfigJson,
  type ArkConfig,
  type ArkConfigLoadResult,
} from './domain/configContract';

export {
  ARK_RULES_SCHEMA,
  ARK_RULES_SCHEMA_VERSION,
  ARK_RULE_SENSORS,
  ArkRulesValidationError,
  buildEffectiveArkRules,
  emptyEffectiveArkRules,
  loadArkRulesContract,
  parseArkRulesJson,
  type ArkRulesFile,
  type ArkRulesIssue,
  type EffectiveArkRules,
} from './domain/arkRulesContract';

export {
  EffectiveContractError,
  effectiveContractPolicyPayload,
  resolveEffectiveContract,
  type EffectiveContract,
  type EffectiveContractWarning,
} from './domain/effectiveContract';

export {
  buildArkRuleFileHints,
  collectEmptyAppliesToFindings,
  deriveArkRuleFileHints,
  evaluateArkRuleSensors,
  extractClassShapesFromSource,
  type ClassShapeFact,
  type ArkRuleSensorViolation,
} from './domain/arkRuleSensors';

export {
  ARKRUN_KERNEL_FACTORY_CALLEES,
  ARKRUN_KERNEL_INTERACTION_CALLEES,
  ARKRUN_TRANSPORT_BYPASS_SPECIFIERS,
  arkRunKernelCallKind,
  extractArkRunDeclarationsFromSource,
  extractArkRunImportedConstructorNamesFromSource,
  extractArkRunKernelCallsFromSource,
  extractArkRunManagedNewsFromSource,
  extractArkRunValueImportDependenciesFromSource,
  isArkRunKernelModuleSpecifier,
  isArkRunTransportBypassSpecifier,
} from './domain/arkRunFacts';

export {
  EXTRA_MERGE_TEETH_GOVERNED_FLOOR,
  MERGE_PLANES_DUAL_STAMP,
  classifyResolvedLayerCoverage,
  composeMergePlanesHonesty,
  demoteExtraPlaneTeethUnderClassificationFloor,
  extraMergeTeethAllowed,
  isArkOrderRuleId,
  isArkRunRuleId,
  isExtraPlaneFinding,
  normalizeExtraMergeTeethClassification,
  type ExtraMergeTeethClassification,
  type MergePlanesHonesty,
} from './domain/extraMergeTeeth';

export {
  ARK_RUN_DOCTOR_SCHEMA_VERSION,
  formatArkRunDoctorLines,
  projectStatusArkRun,
  summarizeArkRunSection,
  type ArkRunDoctorSection,
  type ArkRunStatusSlice,
} from './domain/arkRunDoctor';

export {
  ARKRUN_INTERACTION_NAME_INCOMPLETE,
  ARKRUN_RULE_IDS,
  ARKRUN_TIER1_SENSOR_IDS,
  evaluateArkRunEditorSensors,
  evaluateArkRunEditorSensorsFromSource,
  evaluateArkRunSensors,
  type ArkRunRuleId,
  type ArkRunSensorFinding,
  type ArkRunTier1SensorId,
  type EvaluateArkRunSensorsInput,
  type EvaluateArkRunSensorsResult,
} from './domain/arkRunSensors';

export {
  ARKORDER_RULE_IDS,
  ARKORDER_TIER1_SENSOR_IDS,
  evaluateArkOrderSensors,
  type ArkOrderRuleId,
  type ArkOrderSensorFinding,
} from './domain/arkOrderSensors';

export {
  canPromoteInvariant,
  classifyCoverage,
  countsAsCoverage,
  describeCoverage,
  evaluateInvariantCoverage,
  type CoverageEvidence,
  type CoverageFiles,
  type CoverageInvariant,
  type DeclarationShape,
  type InvariantCoverageEvidence,
  type MentionContext,
} from './domain/invariantCoverage';

export { type InvariantProbeSummary } from './domain/invariantProbe';

export {
  buildRulesInventory,
  inventoryToExtractionCard,
  type RulesInventoryCandidate,
  type RulesInventoryResult,
} from './domain/rulesInventory';

export {
  ARK_STATUS_MANIFEST_SCHEMA,
  ARK_STATUS_MANIFEST_SCHEMA_URL,
  ARK_STATUS_MANIFEST_SCHEMA_VERSION,
  STATUS_COMPASS_FACTS_SOURCES,
  STATUS_COMPASS_MODES,
  STATUS_COMPASS_REASON_CODES,
  buildStatusManifest,
  classifyStatusWritePath,
  defaultHonestLabel,
  evaluateStatusBinding,
  normalizeStatusImprovementCompass,
  projectStatusImprovementCompass,
  resolveStatusNextAction,
  statusCompassResidualIsSubsetOfDoctor,
  unavailableStatusImprovementCompass,
  type StatusActivationSlice,
  type StatusCheckVerdict,
  type StatusCompassFactsSource,
  type StatusCompassMode,
  type StatusCompassReasonCode,
  type StatusImprovementCompassSlice,
  type StatusLastCheckSlice,
  type StatusManifest,
  type StatusManifestFacts,
  type StatusNextAction,
  type StatusProjectIdentitySlice,
  type StatusRulesSlice,
  type StatusWritePathClass,
} from './domain/statusManifest';

export {
  ARK_IMPROVEMENT_COMPASS_SCHEMA_VERSION,
  IMPROVEMENT_COMPASS_OUT_OF_SCOPE_LENSES,
  IMPROVEMENT_COMPASS_TOP_RESIDUAL_CAP,
  IMPROVEMENT_LENS_IDS,
  buildImprovementCompass,
  formatImprovementCompassDoctorLines,
  formatImprovementCompassResidualLabels,
  primaryImprovementCompassNextAction,
  type ImprovementCompass,
  type ImprovementCompassEvidence,
  type ImprovementCompassFacts,
  type ImprovementCompassNextAction,
  type ImprovementCompassSmellFact,
  type ImprovementCompassViolationFact,
  type ImprovementLens,
  type ImprovementLensId,
  type ImprovementLensStatus,
} from './domain/improvementCompass';

export {
  AGENT_PROJECTION_BEGIN_MARKER,
  AGENT_PROJECTION_END_MARKER,
  AGENT_PROJECTION_ENFORCEMENT_SURFACES,
  AGENT_PROJECTION_NON_ENFORCEMENT_LABEL,
  ARK_AGENT_PROJECTION_SCHEMA_VERSION,
  DEFAULT_AGENT_PROJECTION_RULE_IDS,
  agentProjectionContentIdentity,
  buildAgentProjectionBeginMarker,
  buildAgentProjectionBlock,
  buildAgentProjectionBody,
  buildAgentProjectionMeta,
  extractAgentProjectionBlock,
  formatAgentProjectionCatalogShortList,
  formatAgentProjectionLayers,
  mergeAgentProjectionDocument,
  parseAgentProjectionStamp,
  projectionHasNonEnforcementLabel,
  projectionMatchesPackageVersion,
  type AgentProjectionCatalogEntry,
  type AgentProjectionFacts,
  type AgentProjectionLayerSummary,
  type AgentProjectionMergeAction,
  type AgentProjectionMergeResult,
  type AgentProjectionMeta,
  type AgentProjectionProfile,
} from './domain/agentProjection';

export {
  AGENT_SKILL_ENTRY_FILENAME,
  AGENT_SKILLS_PACKAGE_RELATIVE_ROOT,
  ARK_AGENT_SKILLS_PACKAGE_SCHEMA_VERSION,
  ARK_SKILL_NAMES,
  ARK_SKILL_NAME_COUNT,
  ARK_FIRST_CLASS_SKILL_NAMES,
  ARK_SKILL_STUB_REDIRECTS,
  ARK_SKILL_NORTH_STAR,
  ARK_SKILL_CAPACITY,
  ARK_SKILL_REQUIRED_SURFACES,
  ARK_SKILL_CAPACITY_DEDICATED_DOORS,
  ARK_SKILL_DESCRIPTION_VERSION_PATTERN,
  FLAT_SKILL_TEMPLATES_RELATIVE_ROOT,
  agentSkillEntryRelativePath,
  agentSkillPackageFileRelativePath,
  arkSkillStubRedirect,
  flatSkillTemplateFileRelativePath,
  isArkSkillName,
  isFirstClassArkSkillName,
  isValidAgentSkillName,
  normalizeSkillContent,
  parseSkillDescriptionVersion,
  parseSkillDocument,
  stampSkillDescription,
  stripSkillDescriptionVersion,
  skillDescriptionVersionPrefix,
  validateAgentSkillDocument,
  validateAgentSkillsPackage,
  validateSkillProductCapacity,
  type AgentSkillPackageEntry,
  type AgentSkillValidationIssue,
  type ArkFirstClassSkillName,
  type ArkSkillCapacityDedicatedSurface,
  type ArkSkillCapacitySurface,
  type ArkSkillName,
  type ArkSkillNorthStar,
  type ArkSkillRequiredSurface,
  type ArkSkillStubName,
  type ParseSkillDocumentResult,
  type ParsedSkillFrontmatter,
  type SkillProductCapacityIssue,
  type SkillProductCapacityIssueCode,
  type ValidateAgentSkillDocumentInput,
  type ValidateAgentSkillsPackageResult,
  type ValidateSkillProductCapacityInput,
  type ValidateSkillProductCapacityResult,
} from './domain/agentSkillsPackage';
