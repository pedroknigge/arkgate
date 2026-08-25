import { describe, expect, it } from 'vitest';
import {
  ARKRUN_KERNEL_FACTORY_CALLEES,
  ARKRUN_KERNEL_INTERACTION_CALLEES,
  arkRunKernelCallKind,
  extractArkRunDeclarationsFromSource,
  extractArkRunKernelCallsFromSource,
  extractArkRunManagedNewsFromSource,
  forEachArkRunValueImportClause,
  isArkRunKernelModuleSpecifier,
  isArkRunTransportBypassSpecifier,
} from '../../../src/domain/arkRunFacts';
import {
  RESOLVED_CANDIDATE_FACTS_SCHEMA,
  RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION,
  createResolvedCandidateFacts,
  loadResolvedCandidateFacts,
  resolvedFactsEvidenceRequirementsHash,
  type ResolvedCandidateFactsInput,
} from '../../../src/gate';
import { loadArkConfigContract } from '../../../src/domain/configContract';
import { RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION as TYPES_VERSION } from '../../../src/domain/resolvedCandidateFactsTypes';
import { RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION as SCHEMA_VERSION } from '../../../src/domain/resolvedCandidateFactsSchema';

const BASE_CONFIG = {
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'] },
    { name: 'ApplicationOrchestration', patterns: ['src/application/**'] },
  ],
  rules: [{ from: 'ApplicationOrchestration', to: 'DomainModel', allowed: true }],
};

function factsInput(
  extra: Partial<ResolvedCandidateFactsInput> = {}
): ResolvedCandidateFactsInput {
  const contract = loadArkConfigContract(BASE_CONFIG).config;
  return {
    schemaVersion: '1.0',
    completeness: 'complete',
    completenessReasons: [],
    resolverIdentity: 'rn03-test-resolver@1',
    compilerIdentity: 'typescript@test',
    compilerOptionsHash: 'fnv1a-options',
    tsconfigHash: 'fnv1a-tsconfig',
    evidenceRequirementsHash: resolvedFactsEvidenceRequirementsHash(contract),
    files: [
      {
        path: 'src/main.ts',
        contentHash: 'fnv1a-main',
        parseStatus: 'parsed',
        parseDiagnosticCount: 0,
        exportsOnlyTypes: false,
        typeOnlyExportNames: [],
        hasTopLevelSideEffects: false,
      },
    ],
    dependencies: [],
    capabilityUses: [],
    ambientUses: [],
    publishCalls: [],
    intentReferences: [],
    safetyUses: [],
    ...extra,
  };
}

describe('RN03 ArkRun resolver facts', () => {
  it('keeps facts schema 1.2 additive over 1.0/1.1', () => {
    expect(TYPES_VERSION).toBe(SCHEMA_VERSION);
    expect(RESOLVED_CANDIDATE_FACTS_SCHEMA_VERSION).toBe('1.2');
    expect(RESOLVED_CANDIDATE_FACTS_SCHEMA.properties.schemaVersion.enum).toEqual([
      '1.0',
      '1.1',
      '1.2',
    ]);
    expect(RESOLVED_CANDIDATE_FACTS_SCHEMA.required).not.toContain('arkRunKernelCalls');
    expect(RESOLVED_CANDIDATE_FACTS_SCHEMA.properties.arkRunKernelCalls).toBeTruthy();
    expect(RESOLVED_CANDIDATE_FACTS_SCHEMA.properties.arkRunManagedNews).toBeTruthy();
    expect(RESOLVED_CANDIDATE_FACTS_SCHEMA.properties.arkRunCompositionRootHits).toBeTruthy();
  });

  it('loads 1.0 payloads without ArkRun keys as empty arrays on 1.2', () => {
    const facts = createResolvedCandidateFacts(factsInput());
    expect(facts.schemaVersion).toBe('1.2');
    expect(facts.arkRunKernelCalls).toEqual([]);
    expect(facts.arkRunManagedNews).toEqual([]);
    expect(facts.arkRunCompositionRootHits).toEqual([]);
    expect(facts.arkRunDeclarations).toEqual([]);
    expect(loadResolvedCandidateFacts(facts)).toEqual(facts);
  });

  it('does not change evidenceRequirementsHash when arkRun is absent', () => {
    const without = resolvedFactsEvidenceRequirementsHash(
      loadArkConfigContract({ ...BASE_CONFIG, schemaVersion: '1.1' }).config
    );
    const withSilent = resolvedFactsEvidenceRequirementsHash(
      loadArkConfigContract({ ...BASE_CONFIG, schemaVersion: '1.2' }).config
    );
    expect(withSilent).toBe(without);
  });

  it('maps every closed ArkRun callee to a kernel-call kind', () => {
    for (const name of ARKRUN_KERNEL_FACTORY_CALLEES) {
      expect(arkRunKernelCallKind(name)).toBe('factory');
    }
    for (const name of ARKRUN_KERNEL_INTERACTION_CALLEES) {
      expect(arkRunKernelCallKind(name)).toBeTruthy();
    }
  });

  it('treats the companion package as the kernel, not the gate package', () => {
    expect(isArkRunKernelModuleSpecifier('@arkgate/runtime')).toBe(true);
    expect(isArkRunKernelModuleSpecifier('@arkgate/runtime/nestjs')).toBe(true);
    expect(isArkRunKernelModuleSpecifier('arkgate/runtime')).toBe(true);
    expect(isArkRunKernelModuleSpecifier('arkgate')).toBe(false);
  });

  it('extracts kernel factory call sites, aliases, and composition-root publishers', () => {
    const source = `
import { createArkKernel as makeKernel, createStrictArkKernel } from '@arkgate/runtime';
const ark = makeKernel();
createStrictArkKernel();
ark.publisher('Domain.Order.Placed');
ark.resolve('BillingService');
export function createArkKernel() { return ark; }
`;
    const calls = extractArkRunKernelCallsFromSource('src/main.ts', source);
    expect(ARKRUN_KERNEL_FACTORY_CALLEES).toContain('createArkKernel');
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/main.ts',
          kind: 'factory',
          callee: 'makeKernel',
          viaImport: true,
        }),
        expect.objectContaining({
          kind: 'factory',
          callee: 'createStrictArkKernel',
          viaImport: true,
        }),
        expect.objectContaining({
          kind: 'publisher',
          callee: 'publisher',
          receiver: 'ark',
          nameLiteral: 'Domain.Order.Placed',
        }),
        expect.objectContaining({
          kind: 'resolve',
          callee: 'resolve',
          receiver: 'ark',
          nameLiteral: 'BillingService',
        }),
      ])
    );
    expect(calls.some((call) => call.kind === 'factory' && call.callee === 'createArkKernel')).toBe(
      false
    );
  });

  it('extracts new of admitted types and skips builtins', () => {
    const source = `
import { OrderService } from './order-service';
import { PolicyEngine } from '@arkgate/runtime';
new OrderService();
new PolicyEngine();
new Date();
new Error('no');
`;
    const news = extractArkRunManagedNewsFromSource(
      'src/application/app.ts',
      source,
      new Set(['OrderService'])
    );
    expect(news).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          typeName: 'OrderService',
          importedFrom: './order-service',
        }),
        expect.objectContaining({
          typeName: 'PolicyEngine',
          importedFrom: '@arkgate/runtime',
        }),
      ])
    );
    expect(news.some((fact) => fact.typeName === 'Date' || fact.typeName === 'Error')).toBe(false);
  });

  it('extracts file-scoped uses/reactsTo/raises/sends literals', () => {
    const source = `
export const billing = {
  uses: ['OrderService', 'Clock'],
  reactsTo: ['Domain.Order.Placed'],
  raises: ['Application.Billed'],
  sends: ['Application.Notify'],
};
`;
    expect(extractArkRunDeclarationsFromSource('src/application/billing.ts', source)).toEqual([
      {
        file: 'src/application/billing.ts',
        line: 3,
        uses: ['Clock', 'OrderService'],
        reactsTo: ['Domain.Order.Placed'],
        raises: ['Application.Billed'],
        sends: ['Application.Notify'],
      },
    ]);
  });

  it('matches closed transport-bypass specifiers by exact or package-root subpath', () => {
    expect(isArkRunTransportBypassSpecifier('events')).toBe(true);
    expect(isArkRunTransportBypassSpecifier('node:events')).toBe(true);
    expect(isArkRunTransportBypassSpecifier('kafkajs/src/index')).toBe(true);
    expect(isArkRunTransportBypassSpecifier('@aws-sdk/client-sqs')).toBe(true);
    expect(isArkRunTransportBypassSpecifier('./events')).toBe(false);
    expect(isArkRunTransportBypassSpecifier('events-plus')).toBe(false);
  });

  it('lists value import clauses and skips type-only / commented forms', () => {
    const clauses: Array<{ clause: string; specifier: string }> = [];
    forEachArkRunValueImportClause(
      [
        "import { OrderService } from '../domain/order-service';",
        "import type { Kernel } from '@arkgate/runtime';",
        "// import { EventEmitter } from 'events';",
        "export { Clock } from '../domain/clock';",
      ].join('\n'),
      (clause, specifier) => clauses.push({ clause: clause.trim(), specifier })
    );
    expect(clauses).toEqual([
      { clause: '{ OrderService }', specifier: '../domain/order-service' },
      { clause: '{ Clock }', specifier: '../domain/clock' },
    ]);
  });

  it('canonicalizes ArkRun facts without changing Layers verdicts', () => {
    const facts = createResolvedCandidateFacts(
      factsInput({
        schemaVersion: '1.1',
        arkRunKernelCalls: [
          {
            file: 'src/main.ts',
            line: 4,
            kind: 'factory',
            callee: 'createStrictArkKernel',
            viaImport: true,
          },
        ],
        arkRunCompositionRootHits: [
          { file: 'src/main.ts', matchedRoot: 'src/main.ts', hasKernelFactory: true },
        ],
      })
    );
    expect(facts.arkRunKernelCalls).toHaveLength(1);
    expect(facts.arkRunCompositionRootHits[0]?.hasKernelFactory).toBe(true);
    expect(JSON.stringify(facts)).not.toMatch(/ARKRUN_|ruleId|violations/);
  });
});
