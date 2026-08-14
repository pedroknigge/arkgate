/**
 * Release surface parity — version pins + historical release docs.
 * Structural checks on shipped docs + version metadata (no re-implementation).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { version } from '../../../src/version.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
/** Tree package identity. */
const CURRENT = '4.6.1';
/** Version confirmed on npm `latest`. */
const PUBLISHED_LATEST = '4.6.1';

function read(rel: string) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}

describe('package budget ceilings retain 10% headroom over the recorded clean candidate', () => {
  it('retains at least 10% headroom over the recorded clean candidate', () => {
    const gate = JSON.parse(read('release/package-budgets.v1.json')).packages.gate;
    expect(gate.measuredCandidate).toEqual({
      sha: '4e9ffdc19b8e86709c4d3a79ad07dcfc29654ea9',
      ciCandidateSha: '4e9ffdc19b8e86709c4d3a79ad07dcfc29654ea9',
      ciRun: '31293903842',
      version: '4.3.0',
      packedBytes: 819295,
      unpackedBytes: 2910173,
      files: 190,
    });
    expect([gate.maxPackedBytes, gate.maxUnpackedBytes, gate.maxFiles]).toEqual([
      901225, 3201191, 210,
    ]);
    expect(gate.maxPackedBytes).toBeGreaterThanOrEqual(
      Math.ceil(gate.measuredCandidate.packedBytes * 1.1)
    );
    expect(gate.maxUnpackedBytes).toBeGreaterThanOrEqual(
      Math.ceil(gate.measuredCandidate.unpackedBytes * 1.1)
    );
    expect(gate.maxFiles).toBeGreaterThanOrEqual(Math.ceil(gate.measuredCandidate.files * 1.1));
  });
});

describe(`version bump ${CURRENT}`, () => {
  it('package metadata matches src/version', () => {
    expect(version).toBe(CURRENT);
    const pkg = JSON.parse(read('package.json'));
    const lock = JSON.parse(read('package-lock.json'));
    const server = JSON.parse(read('server.json'));
    expect(pkg.version).toBe(CURRENT);
    expect(lock.version).toBe(CURRENT);
    expect(lock.packages[''].version).toBe(CURRENT);
    expect(server.version).toBe(CURRENT);
    expect(server.packages[0].version).toBe(CURRENT);
  });

  it('supply-chain hygiene pins are on the patched lines', () => {
    const lock = JSON.parse(read('package-lock.json'));
    const fastUri = lock.packages['node_modules/fast-uri']?.version as string;
    expect(fastUri).toBeTruthy();
    // 3.1.5+ closes GHSA-7p8r-x3mc-p8w7 (and earlier 3.1.4 closed GHSA-v2hh-gcrm-f6hx)
    const [maj, min, pat] = fastUri.split('.').map(Number);
    expect(maj).toBeGreaterThanOrEqual(3);
    expect(min * 1000 + pat).toBeGreaterThanOrEqual(1 * 1000 + 5);

    for (const rel of [
      'eval/cases/next-core-imports-db/package.json',
      'eval/cases/monorepo-frontend-core/frontend/package.json',
    ]) {
      const j = JSON.parse(read(rel));
      const next = (j.dependencies?.next || j.devDependencies?.next) as string;
      // Prefer current Next LTS line used in field (16.3.x); still accept patched 15.5.21+ fixtures.
      expect(next, rel).toMatch(/^(16\.\d+\.\d+|15\.5\.(2[1-9]|[3-9]\d))/);
    }
  });
});

describe('CHANGELOG + release note cover 4.2.0 workspace identity train', () => {
  it('records identity, activation, multi-repo skills, portability, and published status', () => {
    const changelog = read('CHANGELOG.md');
    expect(changelog).toMatch(/## 4\.2\.0/);
    expect(changelog).toMatch(/published/i);
    expect(changelog).toMatch(/ark_identity|project identity/i);
    expect(changelog).toMatch(/ark_manifest/i);
    expect(changelog).toMatch(/configured.*restart|required.*restart/is);
    expect(changelog).toMatch(/multi-repo|Same-machine skill/i);
    expect(changelog).toMatch(/Linux.*macOS.*Windows/is);

    const notes = read('docs/releases/4.2.0.md');
    expect(notes).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(notes).toMatch(/arkgate@4\.2\.0/);
    expect(notes).toMatch(/binding\.status.*matched/is);
    expect(notes).toMatch(/ark_manifest/i);
    expect(notes).toMatch(/ark:\/\/manifest.*unverified|unverified.*ark:\/\/manifest/is);
    expect(notes).toMatch(/4\.2\.0\+ installers/i);
    expect(notes).toMatch(/before 4\.2|pre-4\.2/i);
    expect(notes).toMatch(/No required config migration/i);
    expect(notes).toMatch(/Z09|RB-11/i);
    expect(notes).not.toMatch(/\*\*Status:\*\*\s*prepared/i);
  });

  it('exposes published 4.6.1 as npm latest', () => {
    expect(PUBLISHED_LATEST).toBe('4.6.1');
    expect(CURRENT).toBe('4.6.1');
    expect(read('README.md')).toMatch(/4\.6\.1/);
    expect(read('README.md')).toMatch(/docs\/releases\/4\.6\.1\.md/);
    expect(read('README.md')).toMatch(/4\.6\.0/);
    expect(read('README.md')).toMatch(/docs\/releases\/4\.6\.0\.md/);
    expect(read('CONTRIBUTING.md')).toMatch(/Current published release:.*4\.6\.1/s);
    expect(read('docs/README.md')).toMatch(/Current published:.*4\.6\.1/s);
    expect(read('docs/package-surface.md')).toMatch(/current published:.*4\.6\.1/is);
    expect(read('docs/releases/4.6.1.md')).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(read('docs/releases/4.6.1.md')).not.toMatch(/\*\*Status:\*\*\s*prepared/i);
    expect(read('docs/releases/4.6.0.md')).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(read('docs/releases/4.6.0.md')).not.toMatch(/\*\*Status:\*\*\s*prepared/i);
    expect(read('docs/releases/4.5.7.md')).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(read('docs/releases/4.5.6.md')).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(read('docs/releases/4.5.5.md')).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(read('docs/releases/4.5.0.md')).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(read('docs/releases/4.4.0.md')).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(read('docs/releases/4.3.0.md')).toMatch(/\*\*Status:\*\*\s*published/i);
  });
});

describe('CHANGELOG + release note cover 4.6.1 five-door + team parliament train', () => {
  it('records five doors, team lock, published status', () => {
    const changelog = read('CHANGELOG.md');
    expect(changelog).toMatch(/## 4\.6\.1/);
    expect(changelog).toMatch(/Five-door|five-door|\/ark-adopt/i);
    expect(changelog).toMatch(/Team parliament|stewards|--contract-session|--changed/i);
    expect(changelog).toMatch(/GitHub handle|noreply|user\.name/i);
    expect(changelog).toMatch(/Status:\s*published|on npm `latest`/i);
    expect(changelog).toMatch(/No required config migration/i);

    const notes = read('docs/releases/4.6.1.md');
    expect(notes).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(notes).not.toMatch(/\*\*Status:\*\*\s*prepared/i);
    expect(notes).toMatch(/4\.6\.1/);
    expect(notes).toMatch(/five-door|\/ark-adopt|\/ark-place|\/ark-autopilot/i);
    expect(notes).toMatch(/stewards|--contract-session|--changed|--against/i);
    expect(notes).toMatch(/GitHub handle|noreply/i);
    expect(notes).toMatch(/No required config migration/i);
    expect(notes).toMatch(/Z09|RB-11/i);
    expect(notes).toMatch(/mcp-publisher validate server\.json/);
  });
});

describe('CHANGELOG + release note cover 4.6.0 understandable Ark train', () => {
  it('records plain language, shared homes, published status', () => {
    const changelog = read('CHANGELOG.md');
    expect(changelog).toMatch(/## 4\.6\.0/);
    expect(changelog).toMatch(/leftover design work|plain language|Understandable Ark/i);
    expect(changelog).toMatch(/--agent-homes|--claude-home|--grok-home/);
    expect(changelog).toMatch(/ArkGate/i);
    expect(changelog).toMatch(/ArkRules/i);
    expect(changelog).toMatch(/Status:\s*published|on npm `latest`/i);
    expect(changelog).toMatch(/No required config migration/i);

    const notes = read('docs/releases/4.6.0.md');
    expect(notes).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(notes).not.toMatch(/\*\*Status:\*\*\s*prepared/i);
    expect(notes).toMatch(/4\.6\.0/);
    expect(notes).toMatch(/leftover design work|plain language|shared/i);
    expect(notes).toMatch(/--agent-homes|--claude-home/);
    expect(notes).toMatch(/No required config migration/i);
    expect(notes).toMatch(/Z09|RB-11/i);
  });
});

describe('CHANGELOG + release note cover 4.5.7 Cursor hard-write train', () => {
  it('records Cursor hard write surfaces and published status', () => {
    const changelog = read('CHANGELOG.md');
    expect(changelog).toMatch(/## 4\.5\.7/);
    expect(changelog).toMatch(/Cursor hard write|\.cursor\/hooks\.json|preToolUse/i);
    expect(changelog).toMatch(/Write\|StrReplace|Write \/ StrReplace|Write\/StrReplace/i);
    expect(changelog).toMatch(/Status:\s*published|on npm `latest`/i);
    expect(changelog).toMatch(/No required config migration/i);

    const notes = read('docs/releases/4.5.7.md');
    expect(notes).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(notes).not.toMatch(/\*\*Status:\*\*\s*prepared/i);
    expect(notes).toMatch(/4\.5\.7/);
    expect(notes).toMatch(/\.cursor\/hooks\.json|preToolUse/i);
    expect(notes).toMatch(/Write|StrReplace/i);
    expect(notes).toMatch(/reinjection/i);
    expect(notes).toMatch(/No required config migration/i);
    expect(notes).toMatch(/Z09|RB-11/i);
    expect(notes).toMatch(/Codex|OpenCode/i);
  });
});

describe('CHANGELOG + release note cover 4.5.6 field-upgrade MCP truth train', () => {
  it('records FX surfaces and published status', () => {
    const changelog = read('CHANGELOG.md');
    expect(changelog).toMatch(/## 4\.5\.6/);
    expect(changelog).toMatch(/Registry-aware|BEHIND_REGISTRY|reasonCode/i);
    expect(changelog).toMatch(/skillDrift|refresh-skills/i);
    expect(changelog).toMatch(/processPackage|processPackageMismatch|processStale/i);
    expect(changelog).toMatch(/postUpgradeChecks/i);
    expect(changelog).toMatch(/Status:\s*published|on npm `latest`/i);
    expect(changelog).toMatch(/No required config migration/i);

    const notes = read('docs/releases/4.5.6.md');
    expect(notes).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(notes).not.toMatch(/\*\*Status:\*\*\s*prepared/i);
    expect(notes).toMatch(/4\.5\.6/);
    expect(notes).toMatch(/Registry-aware|skillDrift|processPackage|refresh-skills/i);
    expect(notes).toMatch(/notAScore|advisory/i);
    expect(notes).toMatch(/No required config migration/i);
    expect(notes).toMatch(/Z09|RB-11/i);
  });
});

describe('CHANGELOG + release note cover 4.5.5 deep-module coach train', () => {
  it('records deep-module coach, whatsNew, two-axis done, published status', () => {
    const changelog = read('CHANGELOG.md');
    expect(changelog).toMatch(/## 4\.5\.5/);
    expect(changelog).toMatch(/Deep-module coach|deepModuleCoach/i);
    expect(changelog).toMatch(/whatsNew|what.?s new|Suggested improvements/i);
    expect(changelog).toMatch(/two-axis done|Enforce green/i);
    expect(changelog).toMatch(/notAScore/);
    expect(changelog).toMatch(/No required config migration/i);
    expect(changelog).toMatch(/Status:\s*published|on npm `latest`/i);

    const notes = read('docs/releases/4.5.5.md');
    expect(notes).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(notes).not.toMatch(/\*\*Status:\*\*\s*prepared/i);
    expect(notes).toMatch(/4\.5\.5/);
    expect(notes).toMatch(/deepModuleCoach|Deep-module coach/i);
    expect(notes).toMatch(/whatsNew|what.?s new|Suggested improvements/i);
    expect(notes).toMatch(/two-axis done|Enforce green/i);
    expect(notes).toMatch(/notAScore/);
    expect(notes).toMatch(/No required config migration/i);
    expect(notes).toMatch(/Z09|RB-11/i);
  });
});

describe('CHANGELOG + release note cover 4.5.0 session honesty train', () => {
  it('records status honesty, self-service upgrade, session recipe, and published status', () => {
    const changelog = read('CHANGELOG.md');
    expect(changelog).toMatch(/## 4\.5\.0/);
    expect(changelog).toMatch(/full.*subset.*unavailable|mode `full`/is);
    expect(changelog).toMatch(/Session recipe|session recipe/i);
    expect(changelog).toMatch(/selfService|self-service|Self-service/i);
    expect(changelog).toMatch(/notAScore/);
    expect(changelog).toMatch(/No required config migration/i);
    expect(changelog).toMatch(/Status:\s*published|on npm `latest`/i);

    const notes = read('docs/releases/4.5.0.md');
    expect(notes).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(notes).not.toMatch(/\*\*Status:\*\*\s*prepared/i);
    expect(notes).toMatch(/4\.5\.0/);
    expect(notes).toMatch(/full.*subset.*unavailable|mode `full`/is);
    expect(notes).toMatch(/Session recipe|session recipe/i);
    expect(notes).toMatch(/selfService|self-service|Self-service/i);
    expect(notes).toMatch(/notAScore/);
    expect(notes).toMatch(/No required config migration/i);
    expect(notes).toMatch(/Z09|RB-11/i);
  });

  it('product docs teach session recipe without roadmap-item narrative', () => {
    const use = read('docs/use.md');
    const guide = read('docs/agent-guide.md');
    expect(use).toMatch(/## Session recipe/i);
    expect(use).toMatch(/Bind identity|bind identity/i);
    expect(use).toMatch(/ark status/i);
    expect(use).toMatch(/subset|unavailable|not full/i);
    expect(guide).toMatch(/### Session recipe/i);
    expect(guide).toMatch(/ark_identity|expectedRoot/i);
    expect(guide).toMatch(/improvementCompass\.mode|mode is not full|mode !== full/i);
    // IC06 hygiene: public lanes must not lead with DF/IC/ACS ticket codes as the story
    expect(use).not.toMatch(/\bDF0[1-6]\b/);
    expect(guide).not.toMatch(/\bDF0[1-6]\b/);
  });
});

describe('CHANGELOG + release note cover 4.4.0 improvement compass train', () => {
  it('records compass surfaces and published status', () => {
    const changelog = read('CHANGELOG.md');
    expect(changelog).toMatch(/## 4\.4\.0/);
    expect(changelog).toMatch(/Improvement compass|improvement compass/i);
    expect(changelog).toMatch(/notAScore/);
    expect(changelog).toMatch(/data-advisory="improvementCompass"|improvementCompass/i);
    expect(changelog).toMatch(/No required config migration/i);
    expect(changelog).toMatch(/Status:\s*published|on npm `latest`/i);

    const notes = read('docs/releases/4.4.0.md');
    expect(notes).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(notes).not.toMatch(/\*\*Status:\*\*\s*prepared/i);
    expect(notes).toMatch(/arkgate@4\.4\.0|4\.4\.0/);
    expect(notes).toMatch(/notAScore/);
    expect(notes).toMatch(/improvement compass|Improvement compass/i);
    expect(notes).toMatch(/modularity/i);
    expect(notes).toMatch(/No required config migration/i);
    expect(notes).toMatch(/Z09|RB-11/i);
  });
});

describe('CHANGELOG + release note cover 4.3.0 agent contract surface train', () => {
  it('records ACS surfaces and published status', () => {
    const changelog = read('CHANGELOG.md');
    expect(changelog).toMatch(/## 4\.3\.0/);
    expect(changelog).toMatch(/Diagnostic code catalog|ACS02/i);
    expect(changelog).toMatch(/status --json|status manifest|ACS03/i);
    expect(changelog).toMatch(/agents-md|agent projection|ACS04/i);
    expect(changelog).toMatch(/Agent Skills|agent-skills|ACS05/i);
    expect(changelog).toMatch(/findingRef|finding refs|ACS06/i);
    expect(changelog).toMatch(/placement-ab|placement A\/B|ACS07/i);
    expect(changelog).toMatch(/No required config migration/i);
    expect(changelog).toMatch(/Status:\s*published|on npm `latest`/i);

    const notes = read('docs/releases/4.3.0.md');
    expect(notes).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(notes).toMatch(/arkgate@4\.3\.0/);
    expect(notes).toMatch(/`latest`/);
    expect(notes).toMatch(/No required config migration/i);
    expect(notes).toMatch(/ACS02|diagnostic/i);
    expect(notes).toMatch(/ACS03|status/i);
    expect(notes).toMatch(/ACS04|projection|agents-md/i);
    expect(notes).toMatch(/ACS05|Agent Skills|13/i);
    expect(notes).toMatch(/ACS06|findingRef|1\.5/i);
    expect(notes).toMatch(/ACS07|placement/i);
    expect(notes).toMatch(/Z09|RB-11/i);
    expect(notes).not.toMatch(/\*\*Status:\*\*\s*prepared/i);
  });
});

describe('CHANGELOG + release note cover 4.2.1 Next 16.3 train', () => {
  it('records Next 16 proxy include fix and published status', () => {
    const changelog = read('CHANGELOG.md');
    expect(changelog).toMatch(/## 4\.2\.1/);
    expect(changelog).toMatch(/published/i);
    expect(changelog).toMatch(/proxy\.ts|Next 16/i);
    expect(changelog).toMatch(/16\.3\.0/);

    const notes = read('docs/releases/4.2.1.md');
    expect(notes).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(notes).toMatch(/arkgate@4\.2\.1/);
    expect(notes).toMatch(/proxy\.ts/i);
    expect(notes).toMatch(/16\.3/);
    expect(notes).toMatch(/No required config migration/i);
    expect(notes).not.toMatch(/\*\*Status:\*\*\s*prepared/i);
  });
});

describe('CHANGELOG + release note cover 3.7.0 Phase Y', () => {
  it('CHANGELOG 3.7.0 names every shipped Y surface and both focused fixes', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 3\.7\.0/);
    expect(body).toMatch(/reshape-decisions\.json/);
    expect(body).toMatch(/handler-in-persistence/);
    expect(body).toMatch(/parseHealth/);
    expect(body).toMatch(/Mechanical-edit hygiene \(Y04\)/);
    expect(body).toMatch(/Cycle budgets \(Y05\)/);
    expect(body).toMatch(/node:process/);
    expect(body).toMatch(/Portable peer isolation/);
    expect(body).toMatch(/restore it/i);
    expect(body).toMatch(/No product-policy gate weakening/i);
  });

  it('docs/releases/3.7.0.md has the upgrade path and boundary honesty', () => {
    const body = read('docs/releases/3.7.0.md');
    expect(body).toMatch(/arkgate@3\.7\.0/);
    expect(body).toMatch(/npm install -D arkgate@3\.7\.0/);
    expect(body).toMatch(/reshape-decisions\.json/);
    expect(body).toMatch(/doctor\.parseHealth/);
    expect(body).toMatch(/FORBIDDEN_GLOBAL/);
    expect(body).toMatch(/branch floor is explicitly recalibrated from 85% to 84\.5%/);
    expect(body).toMatch(/mcp-publisher validate server\.json/);
    expect(body).toMatch(/mcp-publisher publish server\.json/);
    expect(body).toMatch(/advisory/i);
    expect(body).toMatch(/No breaking/i);
    expect(body).toMatch(/Y06, Y07, Y09, and Y10 remain parked/);
    expect(body).not.toMatch(/weakens the gate|gate was weakened/i);
  });

  it('public release pointers cover published 4.6.1 and retain prior notes', () => {
    expect(read('README.md')).toMatch(/4\.6\.1/);
    expect(read('README.md')).toMatch(/docs\/releases\/4\.6\.1\.md/);
    expect(read('README.md')).toMatch(/4\.6\.0/);
    expect(read('README.md')).toMatch(/docs\/releases\/4\.6\.0\.md/);
    expect(read('README.md')).toMatch(/4\.5\.7|4\.5\.6|4\.5\.5/);
    expect(read('README.md')).toMatch(/npm `latest`|on npm/);
    expect(read('CONTRIBUTING.md')).toMatch(/Current published release:.*4\.6\.1/s);
    expect(read('CONTRIBUTING.md')).toMatch(/4\.5\.7|4\.5\.6/);
    expect(read('CONTRIBUTING.md')).toMatch(/4\.5\.0|4\.3\.0/);
    expect(read('docs/package-surface.md')).toMatch(/4\.6\.0\.md/);
    expect(read('docs/package-surface.md')).toMatch(/4\.5\.7\.md|4\.5\.6\.md|4\.5\.0\.md|4\.4\.0\.md|4\.3\.0\.md/);
  });
});

describe('CHANGELOG + release note cover 4.1.1 Phase EH + retain 4.1.0 field train', () => {
  it('CHANGELOG 4.1.1 names EH honesty, gitignore, base-ref, provider plan, published status', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 4\.1\.1/);
    expect(body).toMatch(/published/i);
    expect(body).toMatch(/soft-write|environment residual|contractReadiness/i);
    expect(body).toMatch(/gitignore|\.ark\/\*/i);
    expect(body).toMatch(/first-push|base-ref|fail-on-new-smells/i);
    expect(body).toMatch(/unavailable-plan|provider-policy/i);
    expect(body).toMatch(/repair-envelope|reinjection/i);
    expect(body).toMatch(/## 4\.1\.0/);
    expect(body).toMatch(/app\/api|ApplicationOrchestration|Next API/i);
    expect(body).toMatch(/productHonesty|false-green|not finished/i);
  });

  it('docs/releases/4.1.1.md is published with upgrade path and no Z09 closed claims', () => {
    const body = read('docs/releases/4.1.1.md');
    expect(body).toMatch(/arkgate@4\.1\.1|4\.1\.1/);
    expect(body).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(body).not.toMatch(/\*\*Status:\*\*\s*prepared/i);
    expect(body).toMatch(/Z09|RB-11/i);
    expect(body).toMatch(/soft-write|Not finished|contract ready/i);
    expect(body).not.toMatch(/closes Z09|Z09 closed|RB-11 closed/i);
    // Historical publication truth stays pinned even after CURRENT advances.
    const escapedVersion = '4\\.1\\.1';
    expect(body).toMatch(
      new RegExp(
        String.raw`npm view arkgate dist-tags\.latest\`?\s*→\s*\`${escapedVersion}\``
      )
    );
  });

  it('docs/releases/4.1.0.md remains published historical notes', () => {
    const body = read('docs/releases/4.1.0.md');
    expect(body).toMatch(/arkgate@4\.1\.0/);
    expect(body).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(body).toMatch(/productHonesty/i);
  });
});

describe('CHANGELOG + release note cover 4.0.1 Fase 0 field patch', () => {
  it('CHANGELOG 4.0.1 names stale CLI guard, ArkRules HTML catalog, dual-plane honesty', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 4\.0\.1/);
    expect(body).toMatch(/Stale global CLI|fail closed/i);
    expect(body).toMatch(/rulesUnderContract|structure sensors/i);
    expect(body).toMatch(/Dual-plane honesty|never merge into one architecture score/i);
    expect(body).toMatch(/82\.5/);
    expect(body).toMatch(/No required config migration|Does not weaken/i);
  });

  it('docs/releases/4.0.1.md has upgrade path and published honesty', () => {
    const body = read('docs/releases/4.0.1.md');
    expect(body).toMatch(/arkgate@4\.0\.1/);
    expect(body).toMatch(/npm install -D arkgate@4\.0\.1/);
    expect(body).toMatch(/fail closed|stale global CLI/i);
    expect(body).toMatch(/rulesUnderContract|section card/i);
    expect(body).toMatch(/No required config migration/i);
    expect(body).toMatch(/\*\*Released:\*\*/);
    expect(body).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(body).toMatch(/Z09|RB-11/i);
  });
});

describe('CHANGELOG + release note cover 4.0.0 ArkRules major', () => {
  it('CHANGELOG 4.0.0 names AR04 breaking and ArkRules opt-in foundations', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 4\.0\.0/);
    expect(body).toMatch(/arkgate\/runtime|@arkgate\/runtime/);
    expect(body).toMatch(/arkRules|ArkRules/);
    expect(body).toMatch(/classShapes|aggregate-private-state|ARKRULE_SCOPE_EMPTY/i);
    expect(body).toMatch(/Z09|RB-11/i);
    expect(body).toMatch(/Branch floor.*84\.5%.*83\.0%|84\.5% → 83\.0%/i);
    expect(body).not.toMatch(/do not publish as 3\.9\.x/i);
  });

  it('docs/releases/4.0.0.md has upgrade path and published honesty', () => {
    const body = read('docs/releases/4.0.0.md');
    expect(body).toMatch(/arkgate@4\.0\.0/);
    expect(body).toMatch(/npm install -D arkgate@4\.0\.0/);
    expect(body).toMatch(/@arkgate\/runtime/);
    expect(body).toMatch(/Status:\*\*\s*published/i);
    expect(body).toMatch(/Z09|RB-11/i);
    expect(body).toMatch(/opt-in|arkRules/i);
    expect(body).toMatch(/84\.5%.*83\.0%|branch floor/i);
  });
});

describe('CHANGELOG + release note cover 3.9.2 enforcement honesty', () => {
  it('CHANGELOG 3.9.2 names coverage honesty, soft hosts, graph-blind, and design-weak forbids', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 3\.9\.2/);
    expect(body).toMatch(/coverageHonesty|enforcement-honesty|worse-than-no-gate/i);
    expect(body).toMatch(/graph-blind|graphBlindSpots|template-interpolation/i);
    expect(body).toMatch(/multiPilotBatchForbidden|autoApplyForbidden|one pilot/i);
    expect(body).toMatch(/parked-Y07|Y07|Y09/i);
    expect(body).toMatch(/No required config migration/i);
  });

  it('docs/releases/3.9.2.md has upgrade path and published honesty', () => {
    const body = read('docs/releases/3.9.2.md');
    expect(body).toMatch(/arkgate@3\.9\.2/);
    expect(body).toMatch(/npm install -D arkgate@3\.9\.2/);
    expect(body).toMatch(/coverageHonesty|writePath\.honesty|graphBlindSpots/i);
    expect(body).toMatch(/No required config migration/i);
    expect(body).toMatch(/\*\*Released:\*\*/);
    expect(body).toMatch(/\*\*Status:\*\*\s*published/i);
    expect(body).toMatch(/Y07|Y09.*parked/i);
  });
});

describe('CHANGELOG + release note cover 3.9.1 patch hygiene', () => {
  it('CHANGELOG 3.9.1 names onboarding lockfile, fast-uri, and Next fixture pins', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 3\.9\.1/);
    expect(body).toMatch(/o04|lockfile/i);
    expect(body).toMatch(/fast-uri/);
    expect(body).toMatch(/15\.5\.21|Next\.js/i);
    expect(body).toMatch(/No required config migration/i);
  });

  it('docs/releases/3.9.1.md has upgrade path and published honesty', () => {
    const body = read('docs/releases/3.9.1.md');
    expect(body).toMatch(/arkgate@3\.9\.1/);
    expect(body).toMatch(/npm install -D arkgate@3\.9\.1/);
    expect(body).toMatch(/fast-uri|15\.5\.21|lockfile/i);
    expect(body).toMatch(/No required config migration/i);
    expect(body).toMatch(/\*\*Released:\*\*/);
    expect(body).toMatch(/\*\*Status:\*\*\s*published/i);
  });

  it('CHANGELOG + release note still cover 3.9.0 Beautiful Path', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 3\.9\.0/);
    expect(body).toMatch(/product-voice|Beautiful Path/i);
    expect(body).toMatch(/progressive disclosure|compact router/i);
    const notes = read('docs/releases/3.9.0.md');
    expect(notes).toMatch(/arkgate@3\.9\.0/);
    expect(notes).toMatch(/\*\*Released:\*\*/);
    expect(notes).toMatch(/\*\*Status:\*\*\s*published/i);
  });

  it('product-voice has Do table + design-weak/residual lexicon', () => {
    const body = read('docs/product-voice.md');
    expect(body).toMatch(/## Do \(product copy\)/);
    expect(body).toMatch(/\*\*design-weak\*\*/);
    expect(body).toMatch(/\*\*residual\*\*|\*\*leftover design work\*\*|leftover design work/);
    expect(body).toMatch(/advisory write|required CI/i);
  });

  it('field kit exists and stays not-closed', () => {
    expect(fs.existsSync(path.join(REPO, 'docs/field/README.md'))).toBe(true);
    expect(fs.existsSync(path.join(REPO, 'docs/field/preregistration-template.md'))).toBe(true);
    expect(fs.existsSync(path.join(REPO, 'docs/field/cohort-retention-checklist.md'))).toBe(true);
    expect(fs.existsSync(path.join(REPO, 'docs/field/independent-reviewer-manifesto.md'))).toBe(true);
    const kit = read('docs/field/README.md');
    expect(kit).toMatch(/Status: not closed/i);
    expect(kit).not.toMatch(/Z09 is done|RB-11 closed/i);
  });
});

describe('CHANGELOG + release note cover 3.8.3 field journey', () => {
  it('CHANGELOG 3.8.3 names workspace install, start pin, and upgrade recovery', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 3\.8\.3/);
    expect(body).toMatch(/pnpm workspace|pnpm add.*-w/i);
    expect(body).toMatch(/start.*pin|pins `arkgate`/i);
    expect(body).toMatch(/\.mcp\.json/);
    expect(body).toMatch(/Nothing to apply|wouldWrite|unbound/i);
    expect(body).toMatch(/No required config migration/i);
  });

  it('docs/releases/3.8.3.md has the upgrade path and field journey', () => {
    const body = read('docs/releases/3.8.3.md');
    expect(body).toMatch(/arkgate@3\.8\.3/);
    expect(body).toMatch(/npm install -D arkgate@3\.8\.3/);
    expect(body).toMatch(/pnpm.*-w|workspace/i);
    expect(body).toMatch(/\.mcp\.json/);
    expect(body).toMatch(/No required config migration/i);
    expect(body).toMatch(/mcp-publisher validate server\.json/);
  });
});

describe('CHANGELOG + release note cover 3.8.2 field DX', () => {
  it('CHANGELOG 3.8.2 names skill stale, upgrade preview, Y06, and Codex legacy', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 3\.8\.2/);
    expect(body).toMatch(/content-identity|content identity/i);
    expect(body).toMatch(/wouldWrite|Nothing to apply/i);
    expect(body).toMatch(/pureLayerOptIn|pure-layer opt-in/i);
    expect(body).toMatch(/legacy prompts|Codex legacy/i);
    expect(body).toMatch(/No required config migration/i);
  });

  it('docs/releases/3.8.2.md has the upgrade path and field honesty', () => {
    const body = read('docs/releases/3.8.2.md');
    expect(body).toMatch(/arkgate@3\.8\.2/);
    expect(body).toMatch(/npm install -D arkgate@3\.8\.2/);
    expect(body).toMatch(/content identity/i);
    expect(body).toMatch(/Nothing to apply|wouldWrite/i);
    expect(body).toMatch(/Y06|pure/i);
    expect(body).toMatch(/No required config migration/i);
    expect(body).toMatch(/mcp-publisher validate server\.json/);
  });
});

describe('CHANGELOG + release note cover 3.8.1 pure-path patch', () => {
  it('CHANGELOG 3.8.1 names peerIsolation fail-closed and pure-IR fixes', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 3\.8\.1/);
    expect(body).toMatch(/peerIsolation fail-closed/);
    expect(body).toMatch(/type-only named bindings/);
    expect(body).toMatch(/Relative `require` edges/);
    expect(body).toMatch(/Plan-B god-module pilot/);
    expect(body).toMatch(/No required config migration/i);
  });

  it('docs/releases/3.8.1.md has the upgrade path and safety honesty', () => {
    const body = read('docs/releases/3.8.1.md');
    expect(body).toMatch(/arkgate@3\.8\.1/);
    expect(body).toMatch(/npm install -D arkgate@3\.8\.1/);
    expect(body).toMatch(/peerIsolation/);
    expect(body).toMatch(/fail-closed/i);
    expect(body).toMatch(/No required config migration/i);
    expect(body).toMatch(/Z09/);
    expect(body).toMatch(/mcp-publisher validate server\.json/);
  });
});

describe('CHANGELOG + release note cover 3.6.1 Codex project MCP fix', () => {
  it('CHANGELOG 3.6.1 names project scope, doctor honesty, and the home fallback', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 3\.6\.1/);
    expect(body).toMatch(/\.codex\/config\.toml/);
    expect(body).toMatch(/codex-home-multi-project/);
    expect(body).toMatch(/\.claude\/worktrees/);
    expect(body).toMatch(/--codex-home/);
    expect(body).toMatch(/No gate weaken/i);
  });

  it('docs/releases/3.6.1.md has the upgrade and compatibility path', () => {
    const body = read('docs/releases/3.6.1.md');
    expect(body).toMatch(/arkgate@3\.6\.1/);
    expect(body).toMatch(/npm install -D arkgate@3\.6\.1/);
    expect(body).toMatch(/\.codex\/config\.toml/);
    expect(body).toMatch(/"--root", "\."/);
    expect(body).toMatch(/--codex-home/);
    expect(body).toMatch(/unchanged/i);
  });
});

describe('CHANGELOG + release note cover 3.6.0 reshape co-pilot (Phase X close)', () => {
  it('CHANGELOG 3.6.0 section names the X04–X07 surfaces and stays advisory', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 3\.6\.0/);
    expect(body).toMatch(/physicalCohesion/);
    expect(body).toMatch(/reshapePilot/);
    expect(body).toMatch(/notAScore/);
    expect(body).toMatch(/Stale acknowledgments \(X05\)/);
    expect(body).toMatch(/Mid-name families \(X06\)/);
    expect(body).toMatch(/evidence overflow \(X07\)/i);
    expect(body).toMatch(/never applied|no apply path/i);
    expect(body).toMatch(/never a codemod/i);
    expect(body).toMatch(/ADR 0010/);
  });

  it('docs/releases/3.6.0.md has upgrade path and advisory honesty', () => {
    const body = read('docs/releases/3.6.0.md');
    expect(body).toMatch(/arkgate@3\.6\.0/);
    expect(body).toMatch(/npm install -D arkgate@3\.6\.0/);
    expect(body).toMatch(/physicalCohesion/);
    expect(body).toMatch(/fixedByConvention/);
    expect(body).toMatch(/proposed, never applied/i);
    expect(body).toMatch(/merge cards?/i);
    expect(body).toMatch(/ackLifecycle\.stale|staleCount/);
    expect(body).toMatch(/additive and advisory/i);
    expect(body).toMatch(/MCP registration is advisory/i);
    expect(body).not.toMatch(/weakens the gate|gate was weakened/i);
  });
});

describe('CHANGELOG + release note cover 3.5.0 field feedback (Phase X)', () => {
  it('CHANGELOG 3.5.0 section names the X01–X03 surfaces and stays advisory', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 3\.5\.0/);
    expect(body).toMatch(/Report parity \(X01\)/);
    expect(body).toMatch(/data-advisory/);
    expect(body).toMatch(/Acknowledgment lifecycle \(X02\)/);
    expect(body).toMatch(/reviewBy/);
    expect(body).toMatch(/ackLifecycle/);
    expect(body).toMatch(/Lateral-adapter smell \(X03\)/);
    expect(body).toMatch(/own family/i);
    expect(body).toMatch(/advisory/i);
  });

  it('docs/releases/3.5.0.md has upgrade path and advisory honesty', () => {
    const body = read('docs/releases/3.5.0.md');
    expect(body).toMatch(/arkgate@3\.5\.0/);
    expect(body).toMatch(/npm install -D arkgate@3\.5\.0/);
    expect(body).toMatch(/reviewBy/);
    expect(body).toMatch(/ack expired/);
    expect(body).toMatch(/data-advisory/);
    expect(body).toMatch(/PaymentsAdapters -> PaymentsInfra/);
    expect(body).toMatch(/additive and advisory/i);
    expect(body).toMatch(/MCP registration is advisory/i);
    expect(body).not.toMatch(/weakens the gate|gate was weakened/i);
  });
});

describe('CHANGELOG + release note cover 3.4.0 understandable execution slice 2', () => {
  it('CHANGELOG 3.4.0 section names the U04-U06 surfaces and stays opt-in', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 3\.4\.0/);
    expect(body).toMatch(/Capability walls \(U04\)/);
    expect(body).toMatch(/pure: true/);
    expect(body).toMatch(/CAPABILITY_VIOLATION/);
    expect(body).toMatch(/coverage\s+atoms|Coverage-atom/i);
    expect(body).toMatch(/Ambient-state sensor \(U05/);
    expect(body).toMatch(/bench:hook-path/);
    expect(body).toMatch(/never mechanical-safe/i);
    expect(body).toMatch(/opt-in/i);
  });

  it('docs/releases/3.4.0.md has upgrade path and opt-in honesty', () => {
    const body = read('docs/releases/3.4.0.md');
    expect(body).toMatch(/arkgate@3\.4\.0/);
    expect(body).toMatch(/npm install -D arkgate@3\.4\.0/);
    expect(body).toMatch(/pure.*true|"pure": true/);
    expect(body).toMatch(/never rewrites\s+code silently|never auto-patched/i);
    expect(body).toMatch(/no strict mode/i);
    expect(body).toMatch(/MCP registration is advisory/i);
    expect(body).not.toMatch(/weakens the gate|gate was weakened/i);
  });
});

describe('CHANGELOG + release note cover 3.3.0 understandable execution slice 1', () => {
  it('CHANGELOG 3.3.0 section names the U01-U03 surfaces and stays evidence-only', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 3\.3\.0/);
    expect(body).toMatch(/ADR 0009/);
    expect(body).toMatch(/collectCapabilityUses/);
    expect(body).toMatch(/capabilityUses/);
    expect(body).toMatch(/evidence-only/i);
    expect(body).toMatch(/zero design smells/i);
  });

  it('docs/releases/3.3.0.md has upgrade path and evidence-only honesty', () => {
    const body = read('docs/releases/3.3.0.md');
    expect(body).toMatch(/arkgate@3\.3\.0/);
    expect(body).toMatch(/npm install -D arkgate@3\.3\.0/);
    expect(body).toMatch(/evidence-only/i);
    expect(body).toMatch(/transitive inference never/i);
    expect(body).toMatch(/MCP registration is advisory/i);
    expect(body).not.toMatch(/weakens the gate|gate was weakened/i);
  });
});

describe('CHANGELOG + release note cover 3.2.0 contract health', () => {
  it('CHANGELOG 3.2.0 section names the W01–W03 surfaces and stays advisory', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 3\.2\.0/);
    expect(body).toMatch(/contract smells/i);
    expect(body).toMatch(/contractHealth/);
    expect(body).toMatch(/contract-smell-acks\.json/);
    expect(body).toMatch(/governance weight/i);
    expect(body).toMatch(/notAScore/);
    expect(body).toMatch(/deliberate trade-off, not a gap/i);
    expect(body).toMatch(/advisory only/i);
  });

  it('docs/releases/3.2.0.md has upgrade path and advisory honesty', () => {
    const body = read('docs/releases/3.2.0.md');
    expect(body).toMatch(/arkgate@3\.2\.0/);
    expect(body).toMatch(/npm install -D arkgate@3\.2\.0/);
    expect(body).toMatch(/contractHealth/);
    expect(body).toMatch(/governanceWeight/);
    expect(body).toMatch(/notAScore/);
    expect(body).toMatch(/advisory only/i);
    expect(body).toMatch(/MCP registration is advisory/i);
    expect(body).not.toMatch(/weakens the gate|gate was weakened/i);
  });
});

describe('CHANGELOG + release note cover 3.1.0 change integrity', () => {
  it('CHANGELOG 3.1.0 section names the T01–T05 surfaces', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 3\.1\.0/);
    expect(body).toMatch(/policy-transition guard/i);
    expect(body).toMatch(/atomic change preflight/i);
    expect(body).toMatch(/architecture change map/i);
    expect(body).toMatch(/structural convergence/i);
    expect(body).toMatch(/context-independent enforcement/i);
  });

  it('docs/releases/3.1.0.md has upgrade path and enforcement honesty', () => {
    const body = read('docs/releases/3.1.0.md');
    expect(body).toMatch(/arkgate@3\.1\.0/);
    expect(body).toMatch(/npm install -D arkgate@3\.1\.0/);
    expect(body).toMatch(/ark_prepare_change/);
    expect(body).toMatch(/MCP registration is advisory/i);
    expect(body).toMatch(/behavioral completion|behavior are complete/i);
    expect(body).not.toMatch(/weakens the gate|gate was weakened/i);
  });
});

describe('CHANGELOG + release note cover 3.0.5 Codex honesty', () => {
  it('CHANGELOG 3.0.5 section names Codex skill catalog fixes', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 3\.0\.5/);
    expect(body).toMatch(/\.agents\/skills|SKILL\.md/i);
    expect(body).toMatch(/legacy-prompts|legacy prompts/i);
    expect(body).toMatch(/fail-closed|strict-merge/i);
    expect(body).toMatch(/write-path honesty|advisory/i);
  });

  it('docs/releases/3.0.5.md has upgrade path and honesty', () => {
    const body = read('docs/releases/3.0.5.md');
    expect(body).toMatch(/arkgate@3\.0\.5/);
    expect(body).toMatch(/npm install -D arkgate@3\.0\.5/);
    expect(body).toMatch(/\.agents\/skills|codex-home/i);
    expect(body).not.toMatch(/weakens the gate|gate was weakened/i);
  });
});

describe('CHANGELOG + release note cover 3.0.4 report honesty (historical)', () => {
  it('CHANGELOG 3.0.4 section names report fixes and design strip', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 3\.0\.4/);
    expect(body).toMatch(/false ADAPT|coreOptionalWithFiles|CORE_LAYER_NAMES/i);
    expect(body).toMatch(/write-path-none/i);
    expect(body).toMatch(/design-depth strip|design-weak/i);
    expect(body).toMatch(/metric hints|KPI/i);
  });

  it('docs/releases/3.0.4.md has upgrade path and honesty', () => {
    const body = read('docs/releases/3.0.4.md');
    expect(body).toMatch(/arkgate@3\.0\.4/);
    expect(body).toMatch(/npm install -D arkgate@3\.0\.4/);
    expect(body).toMatch(/design-weak|design-depth/i);
    expect(body).toMatch(/write-path|CORE_LAYER|false ADAPT/i);
    expect(body).not.toMatch(/weakens the gate|gate was weakened/i);
  });
});

describe('historical Q06 CHANGELOG + release note cover Q01–Q05', () => {
  it('CHANGELOG 3.0.3 section names Phase Q surfaces', () => {
    const body = read('CHANGELOG.md');
    expect(body).toMatch(/## 3\.0\.3/);
    expect(body).toMatch(/Post-green path \(Q01\)/i);
    expect(body).toMatch(/Smell outcomes \(Q02\)/i);
    expect(body).toMatch(/Golden pattern \(Q03\)/i);
    expect(body).toMatch(/Pilot loop \(Q04\)/i);
    expect(body).toMatch(/AI-velocity eval \(Q05\)/i);
    expect(body).toMatch(/never clears design-weak|neverMechanicalSafe|never mechanical-safe/i);
  });

  it('docs/releases/3.0.3.md has upgrade path and honesty', () => {
    const body = read('docs/releases/3.0.3.md');
    expect(body).toMatch(/arkgate@3\.0\.3/);
    expect(body).toMatch(/npm install -D arkgate@3\.0\.3/);
    expect(body).toMatch(/postGreenPath|clarify-for-ai/);
    expect(body).toMatch(/golden-pattern\.json|goldenPattern/);
    expect(body).toMatch(/pilotLoop/);
    expect(body).toMatch(/eval:ai-velocity/);
    expect(body).toMatch(/never clears design-weak|does \*\*not\*\* ENFORCE|neverMechanicalSafe/i);
    expect(body).not.toMatch(/golden clears design-weak|weakens the gate/i);
  });
});

describe('package-surface + agent-guide parity (post-green / golden / pilot)', () => {
  it('package-surface documents additive doctor/plan consumer fields', () => {
    const body = read('docs/package-surface.md');
    expect(body).toMatch(/postGreenPath|Post-green Shape door|clarify-for-ai/);
    expect(body).toMatch(/plain-language \*\*`outcome`\*\*|outcome/);
    expect(body).toMatch(/Golden pattern|goldenPattern/);
    expect(body).toMatch(/Pilot loop|pilotLoop/);
    expect(body).toMatch(/AI-velocity eval|eval:ai-velocity/);
    expect(body).toMatch(/improvementCompass|Improvement compass/);
  });

  it('agent-guide documents the same consumer path', () => {
    const body = read('docs/agent-guide.md');
    expect(body).toMatch(/postGreenPath|clarify-for-ai|Post-green/);
    expect(body).toMatch(/outcome/);
    expect(body).toMatch(/Golden pattern|golden-pattern\.json|goldenPattern/);
    expect(body).toMatch(/pilotLoop|Pilot loop/);
    expect(body).toMatch(/eval:ai-velocity|AI-velocity/);
  });
});
