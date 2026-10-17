import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARKORDER_FIRST_CONTACT_NEXT, ARKORDER_ONE_BREATH } from '../../../bin/lib/ark-order-doctor.mjs';
import { APPLY_WILL_REFUSE_FIRST_STEP } from '../../../bin/lib/first-step.mjs';
import { START_APPLY_REFUSE_FOOTER } from '../../../bin/ark-shared.mjs';
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
      hostGuarantees: [
        'shared CI merge gate',
        'Write gate: host pre-hook first; MCP prepare is fallback if that hook is missing or fail-open.',
        'exact bytes on apply',
      ],
      unresolvedDecisions: ['Classify three remaining files.'],
    });

    expect(output).toContain('Ark start preview — no files were changed.');
    expect(output).toContain('Your project looks like: explicit layered service.');
    expect(output).not.toContain('confidence');
    expect(output).not.toContain('layered-service');
    expect(output).not.toContain('Compact setup budget');
    expect(output).not.toContain('afterHash');
    expect(output).not.toContain('sha256:create');
    expect(output).toContain('delete .legacy-ark');
    expect(output).toContain('Setup: install package + host gates (see --json).');
    expect(output).toContain('Preview does not write. Apply installs CI.');
    expect(output).toContain('Optional extras stay off. This start is layers only — they stop bad imports.');
    expect(output).not.toContain(ARKORDER_ONE_BREATH);
    expect(output).not.toContain(ARKORDER_FIRST_CONTACT_NEXT);
    expect(output).not.toContain('Commands in the approved setup plan:');
    expect(output).not.toContain('Host guarantees:');
    expect(output).toContain('Write gate: host pre-hook first; MCP prepare is fallback if that hook is missing or fail-open.');
    expect(output).toContain('Unresolved decisions:');
    expect(output).toContain('Classify three remaining files.');
    expect(output).not.toContain('Apply this plan with: arkgate start --apply');
    expect(output).toContain('too big for compact start');
    expect(output).toContain('arkgate-check --init');
    expect(output).toContain(START_APPLY_REFUSE_FOOTER);
    expect(output).toContain('--archetype');
    expect(output).toContain('--preset');
    expect(output).toContain('--force');
    expect(output).toContain('arkgate-check --recommend');
    expect(output).toContain('Review complete file contents with --json.');
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
    expect(output).not.toContain('Compact setup budget');
    expect(output).not.toContain('Commands in the approved setup plan:');
    expect(output).not.toContain('Apply this plan with: arkgate start --apply');
    expect(output).not.toContain('Apply this plan with: ark start --apply');
  });

  it('leads with the unlock path when apply will refuse, and pitches ArkOrder only for a candidate', () => {
    const refused = captureRender({
      root: '/portable/project',
      analysis: { label: 'uncertain', confidence: 0.2 },
      projectedCoverage: { percent: 20, classifiedFiles: 1, totalFiles: 5 },
      setupBudget: { files: 1, bytes: 100, maxFiles: 8, maxBytes: 32 * 1024, ok: true },
      changes: [],
      commands: [],
      hostGuarantees: [],
      unresolvedDecisions: [],
    });
    expect(refused).toContain(APPLY_WILL_REFUSE_FIRST_STEP);
    expect(refused).not.toContain('Apply this plan with: arkgate start --apply');
    expect(refused).not.toContain(ARKORDER_ONE_BREATH);

    const ready = captureRender({
      root: '/portable/project',
      analysis: { label: 'layered', confidence: 0.91 },
      projectedCoverage: { percent: 90, classifiedFiles: 9, totalFiles: 10 },
      setupBudget: { files: 1, bytes: 100, maxFiles: 8, maxBytes: 32 * 1024, ok: true },
      changes: [],
      commands: [],
      hostGuarantees: [],
      unresolvedDecisions: [],
      arkOrderCandidate: true,
    });
    expect(ready).toContain('Apply this plan with: arkgate start --apply');
    expect(ready).not.toContain(APPLY_WILL_REFUSE_FIRST_STEP);
    expect(ready).toContain(ARKORDER_ONE_BREATH);
    expect(ready).toContain(ARKORDER_FIRST_CONTACT_NEXT);
  });

  it('keeps the apply line when the shape is locked or a contract is already on disk', () => {
    const locked = captureRender({
      root: '/portable/project',
      analysis: { label: 'uncertain', confidence: 0.2, explicitShape: true },
      projectedCoverage: { percent: 20, classifiedFiles: 1, totalFiles: 5 },
      setupBudget: { files: 1, bytes: 100, maxFiles: 8, maxBytes: 32 * 1024, ok: true },
      changes: [],
      commands: [],
      hostGuarantees: [],
      unresolvedDecisions: [],
      shapeLocked: true,
      force: true,
    });
    expect(locked).toContain('Apply this plan with: arkgate start --apply');
    expect(locked).not.toContain(APPLY_WILL_REFUSE_FIRST_STEP);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-start-preview-'));
    fs.writeFileSync(path.join(root, 'ark.config.json'), '{}\n');
    const onDisk = captureRender({
      root,
      analysis: { label: 'uncertain', confidence: 0.2 },
      projectedCoverage: { percent: 20, classifiedFiles: 1, totalFiles: 5 },
      setupBudget: { files: 1, bytes: 100, maxFiles: 8, maxBytes: 32 * 1024, ok: true },
      changes: [],
      commands: [],
      hostGuarantees: [],
      unresolvedDecisions: [],
    });
    fs.rmSync(root, { recursive: true, force: true });
    expect(onDisk).toContain('Apply this plan with: arkgate start --apply');
  });
});
