import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderStartPreview } from '../../../bin/lib/start-preview.mjs';

afterEach(() => {
  vi.restoreAllMocks();
});

function captureRender(preview: Parameters<typeof renderStartPreview>[0], options?: { applying?: boolean }) {
  const lines: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((value = '') => {
    lines.push(String(value));
  });
  renderStartPreview(preview, options);
  return lines.join('\n');
}

describe('renderStartPreview direct output coverage', () => {
  it('renders the complete preview, including exceeded budget and unresolved decisions', () => {
    const output = captureRender({
      root: '/portable/project',
      analysis: {
        label: 'explicit layered service',
        archetype: 'layered-service',
        confidence: 0.91,
      },
      projectedCoverage: { percent: null, classifiedFiles: 0, totalFiles: 3 },
      setupBudget: {
        files: 10,
        arkrulesFiles: 2,
        bytes: 33_000,
        maxFiles: 8,
        maxBytes: 32 * 1024,
        ok: false,
      },
      changes: [
        { action: 'create', path: 'ark.config.json', afterHash: 'sha256:create' },
        { action: 'edit', path: 'AGENTS.md', afterHash: 'sha256:edit' },
        { action: 'delete', path: '.legacy-ark', afterHash: null },
      ],
      commands: ['npm install arkgate', 'ark-check --init'],
      hostGuarantees: ['shared CI merge gate', 'exact bytes on apply'],
      unresolvedDecisions: ['Classify three remaining files.'],
    });

    expect(output).toContain('Ark start preview — no files were changed.');
    expect(output).toContain(
      'Your project looks like: explicit layered service (layered-service, confidence 0.91).'
    );
    expect(output).toContain('Projected governed coverage: unknown% (0/3 files)');
    expect(output).toContain(
      'Compact setup budget: 10/8 gate files (+2 arkrules), 33000/32768 bytes (exceeded).'
    );
    expect(output).toContain('delete .legacy-ark  (deleted)');
    expect(output).toContain('Commands in the approved setup plan:');
    expect(output).toContain('npm install arkgate');
    expect(output).toContain('Host guarantees:');
    expect(output).toContain('Unresolved decisions:');
    expect(output).toContain('Classify three remaining files.');
    expect(output).toContain('Apply this plan with: arkgate start --apply');
    expect(output).toContain('Review complete file contents with --json.');
    expect(output.indexOf('Apply this plan with: arkgate start --apply')).toBeLessThan(
      output.indexOf('Projected governed coverage')
    );
  });

  it('renders an empty apply without preview-only instructions', () => {
    const output = captureRender(
      {
        root: 'C:\\portable\\project',
        analysis: null,
        projectedCoverage: { percent: 0, classifiedFiles: 0, totalFiles: 0 },
        setupBudget: {
          files: 0,
          gateFiles: 0,
          arkrulesFiles: 0,
          bytes: 0,
          maxFiles: 8,
          maxBytes: 32 * 1024,
          ok: true,
        },
        changes: [],
        commands: [],
        hostGuarantees: [],
        unresolvedDecisions: [],
      },
      { applying: true }
    );

    expect(output).toContain('Ark start apply — reviewing plan (no mutations pending).');
    expect(output).toContain('Files create/edit/delete:\n  (none)');
    expect(output).toContain('Compact setup budget: 0/8 gate files, 0/32768 bytes.');
    expect(output).not.toContain('Commands in the approved setup plan:');
    expect(output).not.toContain('Apply this plan with: arkgate start --apply');
    expect(output).not.toContain('Apply this plan with: ark start --apply');
  });
});
