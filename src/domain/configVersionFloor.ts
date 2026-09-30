/**
 * Config-key version floors plus pin evidence (#338).
 *
 * A slice key such as `childSlices` is rejected at config load by an older
 * arkgate (the rule schema sets `additionalProperties: false`). ArkGate warns
 * about that only with evidence that this repo pins such an older arkgate: an
 * exact package.json dependency, the installed copy, the lockfile, a hook
 * script, or a CI workflow. Without evidence it stays silent.
 *
 * Pure: Tooling reads the files and passes their text here.
 */

/** Where a pin was found. */
export type ArkgatePinSource = 'package-json' | 'package-lock' | 'installed' | 'hook' | 'ci';

export type ArkgatePinEvidence = {
  /** Repo-relative file that pins arkgate. */
  file: string;
  /** 1-based line of the pin. */
  line: number;
  /** Pinned version, without a leading `v`. */
  version: string;
  source: ArkgatePinSource;
};

/**
 * First version that accepts keys added after 4.8.23. The running build caps
 * every floor (see {@link effectiveFloor}): it just accepted this config, so a
 * pin equal to it is never stale, whatever number the release ends up with.
 */
const NEXT_RELEASE = '4.8.24';

type FloorRule = {
  sliceIdentity?: unknown;
  sharedImportsSlice?: unknown;
  childSlices?: unknown;
};

type ConfigKeyFloor = {
  key: string;
  minVersion: string;
  uses: (rule: FloorRule) => boolean;
};

function childSlicesOf(rule: FloorRule): Record<string, unknown> | null {
  const child = rule.childSlices;
  return child !== null && typeof child === 'object' && !Array.isArray(child)
    ? (child as Record<string, unknown>)
    : null;
}

/** Ordered newest floor first so the message names the key that needs the most. */
export const ARKGATE_CONFIG_KEY_FLOORS: readonly ConfigKeyFloor[] = Object.freeze([
  // #341: per-slice ArkRules filename on the child wall.
  {
    key: 'childSlices.arkRulesFile',
    minVersion: NEXT_RELEASE,
    uses: (rule: FloorRule) => typeof childSlicesOf(rule)?.arkRulesFile === 'string',
  },
  // #341: pinned framework route. reason is a label on the same alias.
  {
    key: 'childSlices.sliceAliases.pinned',
    minVersion: NEXT_RELEASE,
    uses: (rule: FloorRule) => {
      const aliases = childSlicesOf(rule)?.sliceAliases;
      if (!Array.isArray(aliases)) return false;
      return aliases.some((alias) => {
        if (alias === null || typeof alias !== 'object') return false;
        const row = alias as { pinned?: unknown; reason?: unknown };
        return row.pinned !== undefined || row.reason !== undefined;
      });
    },
  },
  // #335: object form with stopAt.
  {
    key: 'sharedImportsSlice.stopAt',
    minVersion: NEXT_RELEASE,
    uses: (rule: FloorRule) => rule.sharedImportsSlice !== null && typeof rule.sharedImportsSlice === 'object',
  },
  // #337: inner-wall message.
  {
    key: 'childSlices.message',
    minVersion: NEXT_RELEASE,
    uses: (rule: FloorRule) => childSlicesOf(rule)?.message !== undefined,
  },
  // #336: siblings.ratchet.
  {
    key: 'childSlices.siblings.ratchet',
    minVersion: NEXT_RELEASE,
    uses: (rule: FloorRule) => {
      const siblings = childSlicesOf(rule)?.siblings;
      return siblings !== null && typeof siblings === 'object' && 'ratchet' in (siblings as object);
    },
  },
  // 4.8.23 (#326): childSlices.
  { key: 'childSlices', minVersion: '4.8.23', uses: (rule: FloorRule) => childSlicesOf(rule) !== null },
  // 4.8.23 (#326 PR2): deny-cross-parent.
  {
    key: 'sharedImportsSlice: "deny-cross-parent"',
    minVersion: '4.8.23',
    uses: (rule: FloorRule) => rule.sharedImportsSlice === 'deny-cross-parent',
  },
  // 4.8.21: sliceIdentity.
  { key: 'sliceIdentity', minVersion: '4.8.21', uses: (rule: FloorRule) => rule.sliceIdentity !== undefined },
  // 4.8.20: sharedImportsSlice.
  {
    key: 'sharedImportsSlice',
    minVersion: '4.8.20',
    uses: (rule: FloorRule) => rule.sharedImportsSlice === 'deny',
  },
]);

function versionCore(value: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(value).trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Compare the numeric core (`v` prefix and pre-release tags ignored). Unparseable sorts first. */
export function compareArkgateVersion(left: string, right: string): -1 | 0 | 1 {
  const a = versionCore(left);
  const b = versionCore(right);
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  for (let index = 0; index < 3; index += 1) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/** A floor never exceeds the running build, which accepted this config. */
function effectiveFloor(minVersion: string, runningVersion: string | undefined): string {
  return runningVersion && versionCore(runningVersion) && compareArkgateVersion(runningVersion, minVersion) < 0
    ? runningVersion.replace(/^v/, '')
    : minVersion;
}

/** Keys this config uses that older builds reject, and the highest floor. Null when none. */
export function configVersionFloors(
  rules: readonly FloorRule[] | undefined,
  runningVersion?: string
): { keys: string[]; required: string } | null {
  const keys: string[] = [];
  let required: string | null = null;
  for (const floor of ARKGATE_CONFIG_KEY_FLOORS) {
    if (!(rules ?? []).some((rule) => rule && floor.uses(rule))) continue;
    keys.push(floor.key);
    const min = effectiveFloor(floor.minVersion, runningVersion);
    if (!required || compareArkgateVersion(min, required) > 0) required = min;
  }
  return required ? { keys, required } : null;
}

const EXACT_SPEC = /^(?:=\s*)?v?(\d+\.\d+\.\d+)$/;
const TEXT_PIN = /(?<![\w@/.-])arkgate@v?(\d+\.\d+\.\d+)(?![\w.])/g;
const ACTION_PIN = /pedroknigge\/arkgate@v?(\d+\.\d+\.\d+)(?![\w.])/g;
const ACTION_USE = /pedroknigge\/arkgate@/;
const ACTION_VERSION_INPUT = /^\s*version:\s*['"]?v?(\d+\.\d+\.\d+)['"]?\s*$/;

function lineOfIndex(content: string, index: number): number {
  let line = 1;
  for (let at = 0; at < index && at < content.length; at += 1) {
    if (content[at] === '\n') line += 1;
  }
  return line;
}

function lineOfJsonKey(content: string, key: string, from = 0): number {
  const at = content.indexOf(`"${key}"`, from);
  return at < 0 ? 1 : lineOfIndex(content, at);
}

/** `with: version: X` under a step that uses the ArkGate action. */
function actionVersionInputs(file: string, content: string): ArkgatePinEvidence[] {
  const out: ArkgatePinEvidence[] = [];
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const usesLine = lines[index] ?? '';
    if (!ACTION_USE.test(usesLine)) continue;
    const dash = /^(\s*)-\s/.exec(usesLine);
    const stepIndent = dash ? (dash[1] ?? '').length : usesLine.length - usesLine.trimStart().length - 2;
    for (let next = index + 1; next < lines.length; next += 1) {
      const text = lines[next] ?? '';
      if (text.trim().length === 0) continue;
      if (text.length - text.trimStart().length <= stepIndent) break;
      const version = ACTION_VERSION_INPUT.exec(text);
      if (version) out.push({ file, line: next + 1, version: version[1] ?? '', source: 'ci' });
    }
  }
  return out;
}

function textPins(file: string, content: string, source: ArkgatePinSource): ArkgatePinEvidence[] {
  const out: ArkgatePinEvidence[] = [];
  for (const pattern of [TEXT_PIN, ACTION_PIN]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      out.push({ file, line: lineOfIndex(content, match.index), version: match[1] ?? '', source });
    }
  }
  if (source === 'ci') out.push(...actionVersionInputs(file, content));
  return out;
}

function jsonPins(file: string, content: string, source: ArkgatePinSource): ArkgatePinEvidence[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (parsed === null || typeof parsed !== 'object') return [];
  const doc = parsed as Record<string, unknown>;
  const out: ArkgatePinEvidence[] = [];
  if (source === 'installed') {
    if (doc.name === 'arkgate' && typeof doc.version === 'string' && versionCore(doc.version)) {
      out.push({ file, line: lineOfJsonKey(content, 'version'), version: doc.version.replace(/^v/, ''), source });
    }
    return out;
  }
  if (source === 'package-lock') {
    const packages = doc.packages as Record<string, { version?: unknown }> | undefined;
    const entry = packages?.['node_modules/arkgate'];
    if (entry && typeof entry.version === 'string' && versionCore(entry.version)) {
      const keyAt = content.indexOf('"node_modules/arkgate"');
      out.push({
        file,
        line: lineOfJsonKey(content, 'version', keyAt < 0 ? 0 : keyAt),
        version: entry.version.replace(/^v/, ''),
        source,
      });
    }
    return out;
  }
  // package.json: exact dependency specs only; ranges, tags, file: and git URLs are not evidence.
  if (doc.name === 'arkgate') return [];
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const deps = doc[field] as Record<string, unknown> | undefined;
    const spec = deps && typeof deps === 'object' ? deps.arkgate : undefined;
    if (typeof spec !== 'string') continue;
    const exact = EXACT_SPEC.exec(spec.trim());
    if (!exact) continue;
    const fieldAt = content.indexOf(`"${field}"`);
    out.push({
      file,
      line: lineOfJsonKey(content, 'arkgate', fieldAt < 0 ? 0 : fieldAt),
      version: exact[1] ?? '',
      source,
    });
  }
  const scripts = doc.scripts as Record<string, unknown> | undefined;
  if (scripts && typeof scripts === 'object') {
    const scriptsAt = content.indexOf('"scripts"');
    for (const pin of textPins(file, content.slice(Math.max(scriptsAt, 0)), 'package-json')) {
      out.push({ ...pin, line: pin.line + (scriptsAt < 0 ? 0 : lineOfIndex(content, scriptsAt) - 1) });
    }
  }
  return out;
}

/** Pins of arkgate in one file's text. `relPath` is repo-relative. */
export function parseArkgatePins(
  relPath: string,
  content: string,
  source: ArkgatePinSource
): ArkgatePinEvidence[] {
  if (typeof content !== 'string' || content.length === 0) return [];
  const pins =
    source === 'hook' || source === 'ci'
      ? textPins(relPath, content, source)
      : jsonPins(relPath, content, source);
  return pins.filter((pin) => versionCore(pin.version) !== null);
}

export type ConfigVersionPinFinding = {
  ruleId: 'CONFIG_CHILD_SLICES_VERSION';
  failsStrict: false;
  path: string;
  line: number;
  message: string;
  nextAction: string;
};

/**
 * One advisory per stale pin. Silent when the config uses no floored key, when
 * there is no pin evidence, or when every pin is at or above the floor.
 */
export function configVersionPinFindings(input: {
  rules: readonly FloorRule[] | undefined;
  pins: readonly ArkgatePinEvidence[] | undefined;
  runningVersion?: string;
}): ConfigVersionPinFinding[] {
  const floors = configVersionFloors(input.rules, input.runningVersion);
  if (!floors || !input.pins?.length) return [];
  const running = input.runningVersion;
  const target =
    running && versionCore(running) && compareArkgateVersion(running, floors.required) > 0
      ? running.replace(/^v/, '')
      : floors.required;
  const needing = (pin: ArkgatePinEvidence): string[] =>
    ARKGATE_CONFIG_KEY_FLOORS.filter(
      (floor) =>
        floors.keys.includes(floor.key) &&
        compareArkgateVersion(pin.version, effectiveFloor(floor.minVersion, running)) < 0
    ).map((floor) => floor.key);
  const seen = new Set<string>();
  const out: ConfigVersionPinFinding[] = [];
  for (const pin of input.pins) {
    if (compareArkgateVersion(pin.version, floors.required) >= 0) continue;
    const key = `${pin.file}\0${pin.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const keys = needing(pin);
    out.push({
      ruleId: 'CONFIG_CHILD_SLICES_VERSION',
      failsStrict: false,
      path: pin.file,
      line: pin.line,
      message: `ark.config.json uses ${keys.join(', ')} (needs arkgate ${floors.required}+). ${pin.file}:${pin.line} pins arkgate ${pin.version}, which rejects this config at load.`,
      nextAction: `Bump arkgate in ${pin.file} from ${pin.version} to ${target}, then run Ark again.`,
    });
  }
  return out.sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line);
}
