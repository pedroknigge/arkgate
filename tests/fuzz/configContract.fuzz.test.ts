import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ArkConfigValidationError, parseArkConfigJson } from '../../src/domain/configContract';
import { runFuzz } from '../helpers/fuzz';

const fixture = path.resolve(process.cwd(), 'tests/fixtures/fuzz-regressions/config-contract/unsupported-version.json');

describe('config contract fuzzing', () => {
  it('accepts only valid config JSON or reports a typed validation error', () => {
    runFuzz(
      'config-contract',
      fc.property(fc.jsonValue({ maxDepth: 4 }), (value) => {
        try {
          parseArkConfigJson(JSON.stringify(value), 'fuzz.json');
        } catch (error) {
          expect(error).toBeInstanceOf(ArkConfigValidationError);
        }
      })
    );
  });

  it('keeps the minimized unsupported-version regression invalid', () => {
    expect(() => parseArkConfigJson(fs.readFileSync(fixture, 'utf8'), fixture)).toThrow(
      ArkConfigValidationError
    );
  });
});
