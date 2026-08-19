import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAdapterResult,
  toAdapterDiagnostic,
} from '../../../bin/lib/adapter-contract.mjs';
import {
  classifyPublishFacts,
  looksLikeArkIntent,
  resolveIntentLayer,
} from '../../../bin/lib/source-policy.mjs';
import { validateSnippetAnalysis } from '../../../bin/lib/snippet-analysis.mjs';
import { reportUnavailableAnalysis } from '../../../bin/lib/unavailable-analysis.mjs';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Z04 generated adapter branch parity', () => {
  it('normalizes every diagnostic evidence and remediation branch', () => {
    const complete = toAdapterDiagnostic({
      ruleId: 'CUSTOM_RULE',
      severity: 'warning',
      message: 'custom',
      file: 'src/a.ts',
      line: 2,
      column: 3,
      target: 'node:fs',
      fromLayer: 'DomainModel',
      toLayer: 'Tooling',
      typeOnly: false,
      targetTypeOnlyExports: false,
      sourcePureTypeModule: false,
      namedBindingsTypeOnly: false,
      portProofEligible: true,
      peerIsolation: false,
      capability: 'filesystem',
      edgeKind: 'import',
      nextAction: 'Use the reviewed correction.',
    });
    expect(complete).toMatchObject({
      severity: 'warning',
      location: { file: 'src/a.ts', line: 2, column: 3 },
      nextAction: 'Use the reviewed correction.',
      evidence: {
        target: 'node:fs',
        fromLayer: 'DomainModel',
        toLayer: 'Tooling',
        typeOnly: false,
        targetTypeOnlyExports: false,
        sourcePureTypeModule: false,
        namedBindingsTypeOnly: false,
        portProofEligible: true,
        peerIsolation: false,
        capability: 'filesystem',
        edgeKind: 'import',
      },
    });

    const cases = [
      [{ ruleId: 'LAYER_IMPORT_VIOLATION', typeOnly: true }, 'Move the referenced type'],
      [
        { ruleId: 'LAYER_IMPORT_VIOLATION', targetTypeOnlyExports: true },
        'Move the referenced type',
      ],
      [
        { ruleId: 'LAYER_IMPORT_VIOLATION', namedBindingsTypeOnly: true },
        'Move the referenced type',
      ],
      [{ ruleId: 'LAYER_IMPORT_VIOLATION', peerIsolation: true }, 'Extract the shared'],
      [{ ruleId: 'LAYER_IMPORT_VIOLATION' }, 'define a port only if the target is a real use-case'],
      [
        {
          ruleId: 'LAYER_IMPORT_VIOLATION',
          fromLayer: 'DomainModel',
          toLayer: 'PersistenceAdapters',
          target: 'src/infra/db.ts',
        },
        'Define a port in DomainModel',
      ],
      [{ ruleId: 'FORBIDDEN_GLOBAL' }, 'Inject the capability'],
      [{ ruleId: 'CAPABILITY_VIOLATION' }, 'Define a capability port'],
      [{ ruleId: 'CIRCULAR_DEPENDENCY' }, 'Extract the shared dependency'],
      [{ ruleId: 'RAW_EVENT_PUBLISH' }, 'Publish through a registered intent'],
      [{ ruleId: 'PUBLISH_MISSING_SOURCE' }, 'Add metadata.source'],
      [{ code: 'LEGACY_RULE', line: 0, column: -1 }, 'Resolve LEGACY_RULE'],
    ] as const;
    for (const [violation, expected] of cases) {
      expect(toAdapterDiagnostic(violation).nextAction).toContain(expected);
    }
  });

  it('covers every completeness mode, evidence default, and resolved requirement', () => {
    expect(createAdapterResult({ valid: true })).toMatchObject({
      mode: 'lexical-compatibility',
      valid: true,
      completeness: 'complete',
    });
    expect(() =>
      createAdapterResult({
        valid: true,
        completeness: 'complete',
        completenessReasons: [{ code: 'IMPOSSIBLE', message: 'not empty' }],
      })
    ).toThrow('completenessReasons must be empty');

    expect(createAdapterResult({ valid: true, completeness: 'partial' })).toMatchObject({
      valid: false,
      completenessReasons: [{ code: 'ANALYSIS_EVIDENCE_INCOMPLETE' }],
    });
    expect(createAdapterResult({ valid: true, completeness: 'unavailable' })).toMatchObject({
      valid: false,
      completenessReasons: [{ code: 'ANALYSIS_UNAVAILABLE' }],
    });
    expect(
      createAdapterResult({
        valid: true,
        completeness: 'partial',
        completenessReasons: [{ code: '', message: '', file: 'src/a.ts' }],
        policyHash: 'policy',
        resolverIdentity: 'resolver',
        factsHash: 'facts',
        candidateTreeHash: 'tree',
        warnings: [{ code: 'NOTICE' }],
      })
    ).toMatchObject({
      completenessReasons: [
        {
          code: 'ANALYSIS_EVIDENCE_INCOMPLETE',
          message: 'Analysis partial: required evidence is incomplete.',
          file: 'src/a.ts',
        },
      ],
      diagnostics: [{ ruleId: 'NOTICE', severity: 'warning' }],
    });

    const evidence = {
      policyHash: 'policy',
      resolverIdentity: 'resolver',
      factsHash: 'facts',
      candidateTreeHash: 'tree',
    };
    expect(
      createAdapterResult({
        ...evidence,
        mode: 'resolved-candidate-facts',
        completeness: 'complete',
        valid: true,
      })
    ).toMatchObject({ ...evidence, valid: true, completeness: 'complete' });
    expect(
      createAdapterResult({
        ...evidence,
        mode: 'resolved-candidate-facts',
        completeness: 'partial',
        valid: true,
      })
    ).toMatchObject({ ...evidence, valid: false, completeness: 'partial' });
    expect(
      createAdapterResult({
        mode: 'resolved-candidate-facts',
        completeness: 'unavailable',
        valid: true,
      })
    ).toMatchObject({ valid: false, completeness: 'unavailable' });

    for (const missing of Object.keys(evidence)) {
      const incomplete = { ...evidence };
      delete incomplete[missing as keyof typeof incomplete];
      expect(() =>
        createAdapterResult({
          ...incomplete,
          mode: 'resolved-candidate-facts',
          completeness: 'complete',
          valid: true,
        })
      ).toThrow(`${missing} is required`);
    }
  });
});

describe('Z04 generated source and snippet boundaries', () => {
  it('resolves prefixes deterministically and classifies all publish fact shapes', () => {
    const layers = [
      { name: 'fallback', intentPrefixes: ['Domain'] },
      { name: 'specific', prefixes: ['Domain.Order.'] },
      { name: 'tie', prefixes: ['Domain.Order'] },
      { name: 'empty' },
    ];
    expect(resolveIntentLayer('Domain.Order.Placed', layers)).toBe('specific');
    expect(resolveIntentLayer('Domain.Other', layers)).toBe('fallback');
    expect(resolveIntentLayer('External.Other', layers)).toBeUndefined();
    expect(looksLikeArkIntent('Domain.Order.Placed')).toBe(true);
    expect(looksLikeArkIntent('external.order')).toBe(false);
    expect(
      classifyPublishFacts({
        publishCall: false,
        objectHasIntent: true,
        arkPublishCandidate: true,
        hasSource: false,
      })
    ).toEqual([]);
    expect(
      classifyPublishFacts({
        publishCall: true,
        rawIntentName: 'not-an-intent',
        objectHasIntent: true,
        arkPublishCandidate: false,
        hasSource: true,
      }).map(({ ruleId }) => ruleId)
    ).toEqual(['RAW_EVENT_PUBLISH']);
    expect(
      classifyPublishFacts({
        publishCall: true,
        objectHasIntent: false,
        arkPublishCandidate: true,
        hasSource: false,
      }).map(({ ruleId }) => ruleId)
    ).toEqual(['PUBLISH_MISSING_SOURCE']);
  });

  it('reports clean, unavailable, and throwing snippet-host evidence without a green claim', () => {
    const gate = {
      validate: () => ({ lexicalValid: true, violations: undefined }),
    };
    const parsed = {
      ScriptTarget: { Latest: 99 },
      createSourceFile: () => ({ parseDiagnostics: [] }),
    };
    expect(
      validateSnippetAnalysis({ gate, ts: parsed, source: 'export const ok = 1;' })
    ).toMatchObject({ valid: false, lexicalValid: true, completeness: 'partial' });
    expect(
      validateSnippetAnalysis({ gate, ts: undefined, source: 'export const ok = 1;' })
    ).toMatchObject({
      valid: false,
      lexicalValid: false,
      completeness: 'unavailable',
      completenessReasons: [{ code: 'ANALYSIS_HOST_UNAVAILABLE' }],
    });
    expect(
      validateSnippetAnalysis({
        gate,
        ts: {
          ScriptTarget: { Latest: 99 },
          createSourceFile: () => {
            throw new Error('host failed');
          },
        },
        source: 'export const ok = 1;',
        context: { filePath: 'src/a.ts' },
      })
    ).toMatchObject({
      valid: false,
      completeness: 'unavailable',
      violations: [{ ruleId: 'ANALYSIS_HOST_UNAVAILABLE', file: 'src/a.ts' }],
    });
  });

  it('renders the unavailable resolved result through the shared adapter contract', () => {
    const previousExitCode = process.exitCode;
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      reportUnavailableAnalysis({
        root: process.cwd(),
        config: { include: [], layers: [] },
        rules: [],
        files: [],
        args: { json: true },
        message: 'TypeScript host unavailable.',
        nextAction: 'Restore the host.',
        createResult: createAdapterResult,
      });
      expect(process.exitCode).toBe(2);
      expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({
        mode: 'resolved-candidate-facts',
        valid: false,
        completeness: 'unavailable',
        ok: false,
      });
    } finally {
      process.exitCode = previousExitCode;
    }
  });
});
