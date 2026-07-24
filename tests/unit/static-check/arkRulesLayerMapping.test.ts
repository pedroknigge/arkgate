/**
 * Layer name ↔ ArkRules sensor-role mapping and generic template fallback (field P0/P1).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  archetypeTemplateFileForLayer,
  buildArkRulesTemplateForLayer,
  resolveLayerSensorRole,
  withDefaultArkRules,
  writeArkRulesTemplates,
  ARKRULES_SENSOR_ROLES,
} from '../../../bin/lib/presets.mjs';

const tempDirs: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-layer-map-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('resolveLayerSensorRole', () => {
  it('maps known aliases independent of display renames', () => {
    expect(resolveLayerSensorRole('DomainModel')).toBe(ARKRULES_SENSOR_ROLES.DOMAIN_STRUCTURE);
    expect(resolveLayerSensorRole('Domain')).toBe(ARKRULES_SENSOR_ROLES.DOMAIN_STRUCTURE);
    expect(resolveLayerSensorRole('ApplicationOrchestration')).toBe(ARKRULES_SENSOR_ROLES.ORCHESTRATION);
    expect(resolveLayerSensorRole('Application')).toBe(ARKRULES_SENSOR_ROLES.ORCHESTRATION);
    expect(resolveLayerSensorRole('Presentation')).toBe(ARKRULES_SENSOR_ROLES.ADAPTER_THIN);
    expect(resolveLayerSensorRole('Infrastructure')).toBe(ARKRULES_SENSOR_ROLES.ADAPTER_THIN);
    expect(resolveLayerSensorRole('PersistenceAdapters')).toBe(ARKRULES_SENSOR_ROLES.ADAPTER_THIN);
  });

  it('falls back to generic for unknown layer names', () => {
    expect(resolveLayerSensorRole('SharedKernel')).toBe(ARKRULES_SENSOR_ROLES.GENERIC);
    expect(resolveLayerSensorRole('ArchitectureCore')).toBe(ARKRULES_SENSOR_ROLES.GENERIC);
    expect(resolveLayerSensorRole('BackgroundJobsScheduling')).toBe(ARKRULES_SENSOR_ROLES.GENERIC);
  });
});

describe('buildArkRulesTemplateForLayer', () => {
  it('rewrites archetype layer field to the exact project layer name', () => {
    const infra = buildArkRulesTemplateForLayer('Infrastructure');
    expect(infra.layer).toBe('Infrastructure');
    expect(infra.structure?.some((s: { sensor: string }) => s.sensor === 'thin-adapter')).toBe(true);
    expect(archetypeTemplateFileForLayer('Infrastructure')).toBe('PersistenceAdapters.json');

    const presentation = buildArkRulesTemplateForLayer('Presentation');
    expect(presentation.layer).toBe('Presentation');
    expect(archetypeTemplateFileForLayer('Presentation')).toBe('PresentationAdapters.json');
  });

  it('emits a valid empty generic mold for unknown layers', () => {
    const generic = buildArkRulesTemplateForLayer('SharedContracts');
    expect(generic).toMatchObject({
      schemaVersion: '1.0',
      layer: 'SharedContracts',
      structure: [],
      invariants: [],
    });
    expect(generic.$schema).toMatch(/ark\.arkrules\.schema\.json/);
  });
});

describe('withDefaultArkRules + writeArkRulesTemplates', () => {
  it('keys arkRules by exact layer names and writes role-mapped starters', () => {
    const root = makeRoot();
    const config = withDefaultArkRules({
      include: ['src'],
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'] },
        { name: 'Infrastructure', patterns: ['src/infra/**'] },
        { name: 'SharedKernel', patterns: ['src/shared/**'] },
      ],
      rules: [],
    });

    expect(config.arkRules).toEqual({
      DomainModel: 'arkrules/DomainModel.json',
      Infrastructure: 'arkrules/Infrastructure.json',
      SharedKernel: 'arkrules/SharedKernel.json',
    });

    const written = writeArkRulesTemplates(root, config);
    expect(written.sort()).toEqual([
      'arkrules/DomainModel.json',
      'arkrules/Infrastructure.json',
      'arkrules/SharedKernel.json',
    ]);

    const domain = JSON.parse(fs.readFileSync(path.join(root, 'arkrules/DomainModel.json'), 'utf8'));
    expect(domain.layer).toBe('DomainModel');
    expect(domain.structure.length).toBeGreaterThan(0);

    const infra = JSON.parse(fs.readFileSync(path.join(root, 'arkrules/Infrastructure.json'), 'utf8'));
    expect(infra.layer).toBe('Infrastructure');
    expect(infra.structure.some((s: { sensor: string }) => s.sensor === 'thin-adapter')).toBe(true);

    const shared = JSON.parse(fs.readFileSync(path.join(root, 'arkrules/SharedKernel.json'), 'utf8'));
    expect(shared.layer).toBe('SharedKernel');
    expect(shared.structure).toEqual([]);
  });

  it('does not overwrite existing arkRules map entries or files without force', () => {
    const root = makeRoot();
    const base = {
      include: ['src'],
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'] },
        { name: 'Custom', patterns: ['src/custom/**'] },
      ],
      rules: [],
      arkRules: { DomainModel: 'arkrules/custom-domain.json' },
    };
    const next = withDefaultArkRules(base);
    expect(next.arkRules.DomainModel).toBe('arkrules/custom-domain.json');
    expect(next.arkRules.Custom).toBe('arkrules/Custom.json');

    fs.mkdirSync(path.join(root, 'arkrules'), { recursive: true });
    fs.writeFileSync(path.join(root, 'arkrules/Custom.json'), '{"schemaVersion":"1.0","layer":"Custom","structure":[],"invariants":[]}\n');
    const written = writeArkRulesTemplates(root, next);
    expect(written).not.toContain('arkrules/Custom.json');
  });
});
