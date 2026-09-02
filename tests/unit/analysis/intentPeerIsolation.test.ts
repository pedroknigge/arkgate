/**
 * INT-001 / INT-002 — LAYER_INTENT_REFERENCE_VIOLATION shares the peerIsolation
 * classifier with import edges (fromPath + sharedRoots). Amarilla field:
 * ApplicationOrchestration → DomainModel with allowed:false + peerIsolation
 * was denying shared-root app/kernel files that referenced Domain intents.
 *
 * INTENT-001 — collect intent references only at declared sites (events, sagas,
 * publish metadata), not every string whose text matches a layer prefix.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  analyzeResolvedProject,
  createAICodeGate,
  createResolvedCandidateFacts,
  loadContract,
  resolvedFactsEvidenceRequirementsHash,
  type ResolvedCandidateFactsInput,
} from '../../../src/gate';
import {
  findDeniedEdgeDecision,
  peerIsolationDecision,
} from '../../../src/domain/layerMatch';
import { looksLikeArkIntent } from '../../../src/domain/sourcePolicy';
import { loadTypeScript } from '../../../bin/lib/typescript-host.mjs';
import { resolveCandidateFacts } from '../../../bin/lib/resolved-candidate-facts.mjs';

const SLICE_WALL = 'management ⊥ projects — do not import across slices';

const layers = [
  {
    name: 'ApplicationOrchestration',
    patterns: ['src/app/**', 'src/kernel/**', 'src/features/*/application/**'],
  },
  {
    name: 'DomainModel',
    patterns: ['src/domain/**', 'src/features/*/domain/**'],
    intentPrefixes: ['Domain.'],
  },
];

const peerRule = {
  from: 'ApplicationOrchestration',
  to: 'DomainModel',
  allowed: false as const,
  peerIsolation: true,
  sliceFolders: ['features'],
  sharedRoots: ['app', 'kernel'],
  message: SLICE_WALL,
};

const contract = loadContract({
  include: ['src'],
  layers,
  rules: [peerRule],
});

function fileFact(path: string): ResolvedCandidateFactsInput['files'][number] {
  return {
    path,
    contentHash: `fnv1a-${path}`,
    parseStatus: 'parsed',
    parseDiagnosticCount: 0,
    exportsOnlyTypes: false,
    typeOnlyExportNames: [],
    hasTopLevelSideEffects: false,
  };
}

function facts(
  input: Partial<ResolvedCandidateFactsInput> = {}
): ReturnType<typeof createResolvedCandidateFacts> {
  return createResolvedCandidateFacts({
    schemaVersion: '1.2',
    completeness: 'complete',
    completenessReasons: [],
    resolverIdentity: 'arkgate-typescript-resolver@1',
    compilerIdentity: 'typescript@6.0.3',
    compilerOptionsHash: 'fnv1a-options',
    tsconfigHash: 'fnv1a-tsconfig',
    evidenceRequirementsHash: resolvedFactsEvidenceRequirementsHash(contract.config),
    files: [
      fileFact('src/app/eventBus.ts'),
      fileFact('src/kernel/observed.ts'),
      fileFact('src/features/management/application/run.ts'),
      fileFact('src/features/projects/domain/project.ts'),
    ],
    dependencies: [],
    capabilityUses: [],
    ambientUses: [],
    publishCalls: [],
    intentReferences: [],
    safetyUses: [],
    ...input,
  });
}

describe('INT-001 intent refs share the peerIsolation classifier', () => {
  it('does not deny a shared-root fromPath with no toPath (intent is not a file)', () => {
    expect(
      peerIsolationDecision({
        fromPath: 'src/app/eventBus.ts',
        folderCount: 1,
        fromShared: true,
      }).denied
    ).toBe(false);
    expect(
      findDeniedEdgeDecision(contract.config.rules, 'ApplicationOrchestration', 'DomainModel', {
        fromPath: 'src/app/eventBus.ts',
        layers,
      })
    ).toBeUndefined();
    expect(
      findDeniedEdgeDecision(contract.config.rules, 'ApplicationOrchestration', 'DomainModel', {
        fromPath: 'src/kernel/observed.ts',
        layers,
      })
    ).toBeUndefined();
  });

  it('does not invent a fake toPath — an intent string as toPath would mis-slice', () => {
    // Passing the intent name as toPath cannot place it in a slice or shared root,
    // so the classifier would fail-closed. Callers must omit toPath.
    expect(
      findDeniedEdgeDecision(contract.config.rules, 'ApplicationOrchestration', 'DomainModel', {
        fromPath: 'src/app/eventBus.ts',
        toPath: 'Domain.Project.Updated',
        layers,
      })?.peerIsolationReason
    ).toBe('unclassifiable-path');
  });

  it('shared-root app/kernel files referencing Domain intents are not LAYER_INTENT_REFERENCE_VIOLATION', () => {
    const result = analyzeResolvedProject({
      contract,
      facts: facts({
        intentReferences: [
          { file: 'src/app/eventBus.ts', line: 4, intent: 'Domain.Project.Updated' },
          { file: 'src/kernel/observed.ts', line: 7, intent: 'Domain.PaymentApp.Updated' },
        ],
      }),
    });
    const intentHits = result.ir.violations.filter(
      (v) => v.ruleId === 'LAYER_INTENT_REFERENCE_VIOLATION'
    );
    expect(intentHits).toEqual([]);
  });

  it('cross-slice file import probe stays red', () => {
    const result = analyzeResolvedProject({
      contract,
      facts: facts({
        intentReferences: [
          { file: 'src/app/eventBus.ts', line: 4, intent: 'Domain.Project.Updated' },
        ],
        dependencies: [
          {
            from: 'src/features/management/application/run.ts',
            specifier: '../../projects/domain/project',
            kind: 'import',
            typeOnly: false,
            line: 1,
            resolution: 'resolved-project',
            target: 'src/features/projects/domain/project.ts',
            namedBindings: ['Project'],
          },
        ],
      }),
    });
    expect(
      result.ir.violations.filter((v) => v.ruleId === 'LAYER_INTENT_REFERENCE_VIOLATION')
    ).toEqual([]);
    const importHits = result.ir.violations.filter((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION');
    expect(importHits).toEqual([
      expect.objectContaining({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        file: 'src/features/management/application/run.ts',
        target: 'src/features/projects/domain/project.ts',
        fromLayer: 'ApplicationOrchestration',
        toLayer: 'DomainModel',
        peerIsolation: true,
      }),
    ]);
    expect(importHits[0]?.message).toContain('cross-slice');
  });

  it('write-gate LAYER_REFERENCE_VIOLATION uses the same shared-root fromPath evidence', () => {
    const gate = createAICodeGate({
      architectureProfile: {
        name: 'amarilla-peer',
        layers: [
          { name: 'ApplicationOrchestration', prefixes: ['Application.'] },
          { name: 'DomainModel', prefixes: ['Domain.'] },
        ],
        rules: [peerRule],
        resolveLayer: (intent: string) =>
          intent.startsWith('Domain.') ? 'DomainModel' : undefined,
      },
      architectureLayers: layers,
      enforceIntentAllowlist: false,
    });

    const shared = gate.validate(`bus.publish('Domain.Project.Updated', {});`, {
      filePath: 'src/app/eventBus.ts',
      layer: 'ApplicationOrchestration',
    });
    expect(shared.violations.filter((v) => v.ruleId === 'LAYER_REFERENCE_VIOLATION')).toEqual([]);

    const kernelShared = gate.validate(`bus.publish('Domain.Project.Updated', {});`, {
      filePath: 'src/kernel/observed.ts',
      layer: 'ApplicationOrchestration',
    });
    expect(
      kernelShared.violations.filter((v) => v.ruleId === 'LAYER_REFERENCE_VIOLATION')
    ).toEqual([]);
  });
});

describe('INT-002 shared-root intent findings do not inherit the slice wall', () => {
  it('does not emit the peerIsolation cross-slice message for shared-root files', () => {
    const result = analyzeResolvedProject({
      contract,
      facts: facts({
        intentReferences: [
          { file: 'src/app/eventBus.ts', line: 4, intent: 'Domain.Project.Updated' },
          { file: 'src/kernel/observed.ts', line: 7, intent: 'Domain.Contract.ScopeOfWork.Updated' },
        ],
      }),
    });
    const inherited = result.ir.violations.filter(
      (v) =>
        v.ruleId === 'LAYER_INTENT_REFERENCE_VIOLATION' &&
        (v.file === 'src/app/eventBus.ts' || v.file === 'src/kernel/observed.ts') &&
        String(v.message).includes(SLICE_WALL)
    );
    expect(inherited).toEqual([]);
  });
});

const intentRoots: string[] = [];

function writeIntentTree(files: Record<string, string>, config: unknown): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-intent-sites-')));
  intentRoots.push(root);
  fs.writeFileSync(path.join(root, 'ark.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  return root;
}

const amarillaIntentConfig = {
  include: ['src'],
  layers: [
    {
      name: 'DomainModel',
      patterns: ['src/domain/**'],
      intentPrefixes: ['Management.'],
    },
    { name: 'Kernel', patterns: ['src/kernel/**'] },
    { name: 'ApplicationOrchestration', patterns: ['src/app/**'] },
  ],
  rules: [{ from: 'Kernel', to: 'DomainModel', allowed: false }],
};

describe('INTENT-001 intent refs only at declared event/saga/publish-metadata sites', () => {
  afterEach(() => {
    for (const root of intentRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('looksLikeArkIntent still classifies Application.* and not Management.*', () => {
    expect(looksLikeArkIntent('Application.EvmInspection.Data')).toBe(true);
    expect(looksLikeArkIntent('Management.EvmInspection.Data')).toBe(false);
    expect(looksLikeArkIntent('Domain.Order.Placed')).toBe(true);
  });

  it('does not collect Management.EvmInspection.Data from a kernel DType register', async () => {
    const root = writeIntentTree(
      {
        'src/kernel/dtypes.ts': [
          "export const EVM_INSPECTION_DATA = 'Management.EvmInspection.Data';",
          "registerDType('Management.EvmInspection.Data');",
          "export const table = { name: 'Management.EvmInspection.Data' };",
          '',
        ].join('\n'),
      },
      amarillaIntentConfig
    );
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const contract = loadContract(amarillaIntentConfig);
    const facts = resolveCandidateFacts({
      root,
      config: contract.config,
      ts: loaded.ts,
    });
    expect(facts.intentReferences).toEqual([]);
    const result = analyzeResolvedProject({ contract, facts });
    expect(
      result.ir.violations.filter((v) => v.ruleId === 'LAYER_INTENT_REFERENCE_VIOLATION')
    ).toEqual([]);
  });

  it('fail-closes a real publish/subscribe/saga/metadata string of a blocked layer intent', async () => {
    const root = writeIntentTree(
      {
        'src/kernel/flow.ts': [
          "bus.publish('Management.EvmInspection.Started', {});",
          "bus.subscribe('Management.EvmInspection.Closed', () => {});",
          "const saga = { startOn: { intent: 'Management.EvmInspection.Started' }, steps: [{ onEvent: 'Management.EvmInspection.Closed' }] };",
          "export const handler = { reactsTo: ['Management.EvmInspection.Started'] };",
          "bus.publish(Started, {}, { source: 'Management.EvmInspection' });",
          '',
        ].join('\n'),
      },
      amarillaIntentConfig
    );
    const loaded = await loadTypeScript(root);
    expect(loaded.ts).toBeTruthy();
    const contract = loadContract(amarillaIntentConfig);
    const facts = resolveCandidateFacts({
      root,
      config: contract.config,
      ts: loaded.ts,
    });
    const intents = facts.intentReferences.map((ref) => ref.intent).sort();
    expect(intents).toEqual([
      'Management.EvmInspection',
      'Management.EvmInspection.Closed',
      'Management.EvmInspection.Closed',
      'Management.EvmInspection.Started',
      'Management.EvmInspection.Started',
      'Management.EvmInspection.Started',
    ]);
    const result = analyzeResolvedProject({ contract, facts });
    const hits = result.ir.violations.filter(
      (v) => v.ruleId === 'LAYER_INTENT_REFERENCE_VIOLATION'
    );
    expect(hits.length).toBeGreaterThanOrEqual(4);
    expect(hits.every((v) => v.fromLayer === 'Kernel' && v.toLayer === 'DomainModel')).toBe(
      true
    );
  });
});
