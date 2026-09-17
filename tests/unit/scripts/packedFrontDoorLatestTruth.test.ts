import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  changelogSectionForVersion,
  collectPackedFrontDoorErrors,
  frontDoorStalePins,
} from '../../../scripts/packed-front-door-latest-truth.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const STALE_README = `> **ArkGate 4.8.17** is prepared on this tree; npm \`latest\` remains **4.8.16** until \`publish-npm\` for \`v4.8.17\`.
> [4.8.17 prepared](CHANGELOG.md)
| Prepared (4.8.17; not published) | [CHANGELOG](CHANGELOG.md) |
`;

const HONEST_README = `> **ArkGate 4.8.17** is on npm \`latest\`.
> [4.8.17](CHANGELOG.md)
| Current published (4.8.17 on npm \`latest\`) | [CHANGELOG](CHANGELOG.md) |
`;

describe('packed front-door latest truth', () => {
  it('refuses a waiting-room banner when the tarball version is already latest', () => {
    const pins = frontDoorStalePins(STALE_README, '4.8.17');
    expect(pins.map((pin) => pin.kind).sort()).toEqual([
      'latest-remains-older',
      'prepared-link',
      'prepared-not-published',
      'prepared-on-tree',
    ]);
    expect(
      collectPackedFrontDoorErrors({
        version: '4.8.17',
        readme: STALE_README,
        docsReadme: 'Prepared: arkgate@4.8.17; not published until publish-npm for v4.8.17.',
        changelog: '## 4.8.17 — 2026-09-17\n\n**Status: prepared** (npm `latest` remains **4.8.16**).\n\n## 4.8.16 — x\n',
      })
    ).toEqual([
      'README.md: claims npm latest remains 4.8.16 while this package is 4.8.17',
      'README.md: prepared-on-tree (is prepared on this tree) while this package is 4.8.17',
      'README.md: prepared-not-published (Prepared (4.8.17; not published)) while this package is 4.8.17',
      'README.md: prepared-link ([4.8.17 prepared]) while this package is 4.8.17',
      'docs/README.md: not-published-until (not published until) while this package is 4.8.17',
      'CHANGELOG.md (4.8.17): claims npm latest remains 4.8.16 while this package is 4.8.17',
    ]);
  });

  it('accepts an honest current-version banner and ignores older CHANGELOG pins', () => {
    expect(frontDoorStalePins(HONEST_README, '4.8.17')).toEqual([]);
    expect(
      collectPackedFrontDoorErrors({
        version: '4.8.17',
        readme: HONEST_README,
        docsReadme: 'Current published: arkgate@4.8.17 on npm `latest`.',
        changelog:
          '## 4.8.17 — 2026-09-17\n\n**Status: published** (npm `latest` is **4.8.17**).\n\n## 4.8.16 — x\n\n**Status: prepared** (npm `latest` remains **4.8.15**).\n',
      })
    ).toEqual([]);
    expect(changelogSectionForVersion(
      '## 4.8.17 — now\nkeep\n\n## 4.8.16 — then\nskip\n',
      '4.8.17'
    )).toBe('## 4.8.17 — now\nkeep\n');
  });

  it('tree front doors and current CHANGELOG section stay honest for package.json', () => {
    const version = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
    expect(
      collectPackedFrontDoorErrors({
        version,
        readme: fs.readFileSync(path.join(REPO, 'README.md'), 'utf8'),
        docsReadme: fs.readFileSync(path.join(REPO, 'docs/README.md'), 'utf8'),
        changelog: fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8'),
      })
    ).toEqual([]);
  });
});
