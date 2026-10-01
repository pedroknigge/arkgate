/**
 * ADR 0038 — copies across a wall: properties of the pure clone core.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  CLONE_GRAM,
  CLONE_MIN_TOKENS,
  CLONE_WINDOW,
  TOKEN_IDENT,
  candidatePairs,
  extendMatch,
  fingerprint,
  groupFamilies,
  namesAgree,
  sameNames,
  type VerifiedClonePair,
} from '../../src/domain/cloneDetection';
import { runFuzz } from '../helpers/fuzz';

type Token = { kind: number; name?: string };
type FileStream = { path: string; tokens: Token[] };

const kinds = (tokens: readonly Token[]) => tokens.map((token) => token.kind);
const names = (tokens: readonly Token[], start: number, end: number) =>
  tokens.slice(start, end).flatMap((token) => (token.kind === TOKEN_IDENT ? [token.name ?? ''] : []));

/** The whole pipeline over in-memory streams, keyed by path so order cannot leak. */
function pipeline(files: readonly FileStream[]) {
  const hashes: number[] = [];
  const owners: number[] = [];
  const offsets: number[] = [];
  files.forEach((file, index) => {
    const print = fingerprint(kinds(file.tokens));
    for (let i = 0; i < print.hashes.length; i += 1) {
      hashes.push(print.hashes[i] as number);
      owners.push(index);
      offsets.push(print.offsets[i] as number);
    }
  });
  const table = {
    hashes: Uint32Array.from(hashes),
    files: Uint32Array.from(owners),
    offsets: Uint32Array.from(offsets),
    count: hashes.length,
  };
  const { pairs } = candidatePairs(table);
  const verified: VerifiedClonePair[] = [];
  for (const pair of pairs) {
    const a = files[pair.a] as FileStream;
    const b = files[pair.b] as FileStream;
    for (let i = 0; i < pair.seeds.length; i += 2) {
      const match = extendMatch(kinds(a.tokens), kinds(b.tokens), pair.seeds[i] as number, pair.seeds[i + 1] as number);
      if (!match) continue;
      const agreement = sameNames(names(a.tokens, match.aStart, match.aEnd), names(b.tokens, match.bStart, match.bEnd));
      if (!namesAgree(agreement)) continue;
      verified.push({
        a: { path: a.path, start: match.aStart, end: match.aEnd, startLine: match.aStart, endLine: match.aEnd },
        b: { path: b.path, start: match.bStart, end: match.bEnd, startLine: match.bStart, endLine: match.bEnd },
        crossing: 'cross-slice',
        names: agreement,
      });
    }
  }
  return groupFamilies(verified).map((family) => family.members.map((member) => `${member.path}:${member.startLine}-${member.endLine}`));
}

/** Noise from a wide alphabet, so accidental 20-token matches do not happen. */
const noise = fc.array(fc.integer({ min: 2, max: 400 }), { minLength: 0, maxLength: 60 });
const run = fc.array(
  fc.oneof(
    fc.record({ kind: fc.constant(TOKEN_IDENT), name: fc.constantFrom('total', 'items', 'price', 'qty', 'sum') }),
    fc.record({ kind: fc.integer({ min: 2, max: 400 }) })
  ),
  { minLength: CLONE_MIN_TOKENS, maxLength: 120 }
);

function plant(before: number[], body: Token[], after: number[]): Token[] {
  return [...before.map((kind) => ({ kind })), ...body, ...after.map((kind) => ({ kind }))];
}

describe('clone detection properties', () => {
  it('the minimum run keeps the winnowing guarantee', () => {
    expect(CLONE_MIN_TOKENS).toBeGreaterThanOrEqual(CLONE_WINDOW + CLONE_GRAM - 1);
  });

  it('a planted identical run of at least 50 tokens is always found', () => {
    runFuzz(
      'clone-detection-winnowing-guarantee',
      fc.property(noise, noise, noise, noise, run, (beforeA, afterA, beforeB, afterB, body) => {
        const a = plant(beforeA, body, afterA);
        const b = plant(beforeB, body, afterB);
        const printA = fingerprint(kinds(a));
        const printB = fingerprint(kinds(b));
        const table = {
          hashes: Uint32Array.from([...printA.hashes, ...printB.hashes]),
          files: Uint32Array.from([...printA.hashes].map(() => 0).concat([...printB.hashes].map(() => 1))),
          offsets: Uint32Array.from([...printA.offsets, ...printB.offsets]),
          count: printA.hashes.length + printB.hashes.length,
        };
        const pair = candidatePairs(table).pairs.find((row) => row.a === 0 && row.b === 1);
        if (!pair) return false;
        for (let i = 0; i < pair.seeds.length; i += 2) {
          const match = extendMatch(kinds(a), kinds(b), pair.seeds[i] as number, pair.seeds[i + 1] as number);
          if (
            match &&
            match.aStart <= beforeA.length &&
            match.aEnd >= beforeA.length + body.length &&
            match.bStart <= beforeB.length &&
            match.bEnd >= beforeB.length + body.length
          ) {
            return true;
          }
        }
        return false;
      })
    );
  });

  it('families do not depend on file order', () => {
    runFuzz(
      'clone-detection-order-independent',
      fc.property(
        run,
        noise,
        noise,
        noise,
        fc.array(fc.nat(), { minLength: 4, maxLength: 4 }),
        (body, left, middle, right, keys) => {
          const files: FileStream[] = [
            { path: 'src/features/billing/a.ts', tokens: plant(left, body, middle) },
            { path: 'src/features/invoices/b.ts', tokens: plant(middle, body, right) },
            { path: 'src/features/orders/c.ts', tokens: plant(right, body, left) },
            { path: 'src/features/users/d.ts', tokens: plant(left, [], right) },
          ];
          const shuffled = files
            .map((file, index) => ({ file, key: keys[index] ?? 0, index }))
            .sort((x, y) => x.key - y.key || y.index - x.index)
            .map((row) => row.file);
          expect(pipeline(shuffled)).toEqual(pipeline(files));
          const families = pipeline(files);
          expect(families).toHaveLength(1);
          expect(families[0]).toHaveLength(3);
        }
      )
    );
  });

  it('renaming every identifier keeps the candidate but fails name agreement', () => {
    runFuzz(
      'clone-detection-renamed-copy',
      fc.property(noise, noise, run, (before, after, body) => {
        fc.pre(body.some((token) => token.kind === TOKEN_IDENT));
        const renamed = body.map((token) => (token.kind === TOKEN_IDENT ? { ...token, name: `${token.name}Renamed` } : token));
        const a = plant(before, body, after);
        const b = plant(before, renamed, after);
        const match = extendMatch(kinds(a), kinds(b), before.length, before.length);
        if (!match || match.tokens < CLONE_MIN_TOKENS) return false;
        const agreement = sameNames(names(a, match.aStart, match.aEnd), names(b, match.bStart, match.bEnd));
        const same = sameNames(names(a, match.aStart, match.aEnd), names(a, match.aStart, match.aEnd));
        return !namesAgree(agreement) && agreement.same === 0 && namesAgree(same);
      })
    );
  });
});
