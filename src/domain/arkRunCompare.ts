/**
 * In-memory shadow / replay / compare for ArkRun information packages (XP07 / ADR 0033).
 * Not durable. Not a second bus. Stripped snapshots only.
 */
import type { DependencyInformationPackage } from './arkRunInformationPackage';

export type InformationPackageDiff = {
  readonly path: string;
  readonly left: unknown;
  readonly right: unknown;
};

export type InformationPackageCompare = {
  readonly equal: boolean;
  readonly diffs: readonly InformationPackageDiff[];
};

function sortedKeys(value: object): string[] {
  return Object.keys(value).sort();
}

function walk(left: unknown, right: unknown, path: string, diffs: InformationPackageDiff[]): void {
  if (left === right) return;
  if (left === null || right === null || typeof left !== typeof right) {
    diffs.push({ path, left, right });
    return;
  }
  if (typeof left !== 'object' || typeof right !== 'object') {
    if (left !== right) diffs.push({ path, left, right });
    return;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    const a = Array.isArray(left) ? left : [];
    const b = Array.isArray(right) ? right : [];
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i += 1) walk(a[i], b[i], `${path}[${i}]`, diffs);
    return;
  }
  const lobj = left as Record<string, unknown>;
  const robj = right as Record<string, unknown>;
  const keys = new Set([...sortedKeys(lobj), ...sortedKeys(robj)]);
  for (const key of [...keys].sort()) {
    walk(lobj[key], robj[key], path ? `${path}.${key}` : key, diffs);
  }
}

/** Shadow: identity snapshot. The live kernel is not copied. */
export function shadowInformationPackage(
  pack: DependencyInformationPackage
): DependencyInformationPackage {
  return {
    schemaVersion: pack.schemaVersion,
    kernelInstanceId: pack.kernelInstanceId,
    components: pack.components.map((component) => ({
      id: component.id,
      lifetime: component.lifetime,
      uses: [...component.uses],
      reactsTo: [...component.reactsTo],
      raises: [...component.raises],
      sends: [...component.sends],
      ...(component.extendedInfo ? { extendedInfo: { ...component.extendedInfo } } : {}),
    })),
  };
}

export function compareInformationPackages(
  left: DependencyInformationPackage,
  right: DependencyInformationPackage
): InformationPackageCompare {
  const diffs: InformationPackageDiff[] = [];
  walk(left, right, '', diffs);
  return { equal: diffs.length === 0, diffs };
}

/**
 * Replay: apply sequential snapshots as the "tape". Each step is compared to
 * the previous shadow. No bus, no store, no time travel across processes.
 */
export function replayInformationPackages(
  tape: readonly DependencyInformationPackage[]
): InformationPackageCompare[] {
  const out: InformationPackageCompare[] = [];
  for (let i = 1; i < tape.length; i += 1) {
    out.push(compareInformationPackages(tape[i - 1]!, tape[i]!));
  }
  return out;
}
