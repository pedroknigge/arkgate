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
const CURRENT = '3.7.0';

function read(rel: string) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}

describe('Phase Z fixed roadmap-cycle package ceilings', () => {
  it('retains at least 10% headroom over the recorded clean candidate', () => {
    const gate = JSON.parse(read('release/package-budgets.v1.json')).packages.gate;
    expect(gate.measuredCandidate).toEqual({
      sha: '6fa507900acde48fd972045e00c67e0bcdd27589',
      ciCandidateSha: 'b4f25a422de96e004f21c4107aec3b98d2469c61',
      ciRun: 29649631288,
      version: '3.7.0',
      packedBytes: 484608,
      unpackedBytes: 1632090,
      files: 135,
    });
    expect([gate.maxPackedBytes, gate.maxUnpackedBytes, gate.maxFiles]).toEqual([
      534000, 1796000, 149,
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

  it('public latest-release pointers move together', () => {
    expect(read('README.md')).toMatch(/Latest release \(3\.7\.0\).*3\.7\.0\.md/s);
    expect(read('CONTRIBUTING.md')).toMatch(/Current published release:.*3\.7\.0/s);
    expect(read('docs/package-surface.md')).toMatch(/latest:\s*\[3\.7\.0\.md\]/s);
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

describe('Q06 package-surface + agent-guide parity', () => {
  it('package-surface documents Q01–Q05 additive fields', () => {
    const body = read('docs/package-surface.md');
    expect(body).toMatch(/postGreenPath|Post-green path \(Q01\)/);
    expect(body).toMatch(/outcome.*Q02|plain-language \*\*`outcome`\*\* \(Q02\)/);
    expect(body).toMatch(/Golden pattern \(Q03\)|goldenPattern/);
    expect(body).toMatch(/Pilot loop \(Q04\)|pilotLoop/);
    expect(body).toMatch(/AI-velocity eval \(Q05\)|eval:ai-velocity/);
  });

  it('agent-guide documents the same consumer path', () => {
    const body = read('docs/agent-guide.md');
    expect(body).toMatch(/Post-green path \(Q01\)|postGreenPath|clarify-for-ai/);
    expect(body).toMatch(/outcome/);
    expect(body).toMatch(/Golden pattern|golden-pattern\.json|goldenPattern/);
    expect(body).toMatch(/Pilot loop \(Q04\)|pilotLoop/);
    expect(body).toMatch(/eval:ai-velocity|AI-velocity/);
  });
});
