import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createImportTargetResolver,
  resolveSpecifierToRel,
} from '../../../bin/lib/import-resolve.mjs';

describe('import resolver portability', () => {
  it.runIf(process.platform === 'win32')(
    'rejects absolute targets and aliases on another Windows drive',
    () => {
      const currentDrive = path.parse(process.cwd()).root.slice(0, 2).toUpperCase();
      const otherDrive = currentDrive === 'C:' ? 'D:' : 'C:';
      const root = `${currentDrive}\\repo`;
      const externalFile = `${otherDrive}\\outside\\value.ts`;
      const resolver = createImportTargetResolver(null, root, {
        layers: [{ name: 'DomainModel', patterns: ['**/*'] }],
      });

      expect(resolver?.(externalFile)).toBeUndefined();
      expect(
        resolveSpecifierToRel('@/value', `${root}\\src\\entry.ts`, root, {
          baseUrl: `${otherDrive}\\outside`,
          aliases: [{ from: '@/', to: '' }],
        })
      ).toBeUndefined();
    }
  );
});
