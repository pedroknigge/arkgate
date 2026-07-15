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

void legacyResult;
