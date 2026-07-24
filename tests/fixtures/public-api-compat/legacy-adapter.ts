import type { AdapterDiagnostic, AdapterResult } from '../../../src/index';

const legacyDiagnostic: AdapterDiagnostic = {
  ruleId: 'LAYER_IMPORT_VIOLATION',
  severity: 'error',
  message: 'Domain must not import infrastructure.',
  location: { file: 'src/domain/order.ts', line: 1, column: 1 },
  evidence: { fromLayer: 'DomainModel', toLayer: 'PersistenceAdapters' },
};

const legacyResult: AdapterResult = {
  schemaVersion: '1.0',
  valid: false,
  diagnostics: [legacyDiagnostic],
};

const v11Result: AdapterResult = {
  schemaVersion: '1.1',
  valid: false,
  diagnostics: [{ ...legacyDiagnostic, nextAction: 'Define a port, then preflight again.' }],
};

const completeResult: AdapterResult = {
  schemaVersion: '1.2',
  completeness: 'complete',
  valid: true,
  diagnostics: [],
};

const resolvedResult: AdapterResult = {
  schemaVersion: '1.4',
  mode: 'resolved-candidate-facts',
  completeness: 'complete',
  completenessReasons: [],
  valid: true,
  diagnostics: [],
  policyHash: 'fnv1a-policy',
  resolverIdentity: 'resolver@1',
  factsHash: 'fnv1a-facts',
  candidateTreeHash: 'fnv1a-tree',
};

// @ts-expect-error The 1.2 completeness invariant remains source-compatible too.
const v12PartialGreenResult: AdapterResult = {
  schemaVersion: '1.2',
  completeness: 'partial',
  valid: true,
  diagnostics: [],
};

// @ts-expect-error An incomplete 1.4 analysis can never carry a green verdict.
const partialGreenResult: AdapterResult = {
  schemaVersion: '1.4',
  mode: 'lexical-compatibility',
  completeness: 'partial',
  completenessReasons: [{ code: 'LEXICAL_EVIDENCE_INCOMPLETE', message: 'Incomplete.' }],
  valid: true,
  diagnostics: [],
};

// @ts-expect-error Resolved complete results require inspectable input identities.
const resolvedWithoutEvidence: AdapterResult = {
  schemaVersion: '1.4',
  mode: 'resolved-candidate-facts',
  completeness: 'complete',
  completenessReasons: [],
  valid: true,
  diagnostics: [],
};

void legacyResult;
void v11Result;
void completeResult;
void resolvedResult;
void v12PartialGreenResult;
void partialGreenResult;
void resolvedWithoutEvidence;
