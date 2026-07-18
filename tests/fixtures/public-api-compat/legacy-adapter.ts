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

// @ts-expect-error An incomplete 1.2 analysis can never carry a green verdict.
const partialGreenResult: AdapterResult = {
  schemaVersion: '1.2',
  completeness: 'partial',
  valid: true,
  diagnostics: [],
};

void legacyResult;
void v11Result;
void completeResult;
void partialGreenResult;
