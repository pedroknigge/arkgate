/**
 * Per-version upgrade behavior changes.
 *
 * This table is the package source for migration notes. CHANGELOG.md must
 * carry the same sentences (Unreleased / 4.8.21, including the 4.8.20
 * coverage.symbol note). Post-upgrade verification prints these lines so an
 * agent reads them before editing code.
 *
 * Shipped with the package (`bin/lib` is in the published `files` list).
 */

/** @typedef {{ version: string, note: string }} UpgradeBehaviorChange */

/** @type {readonly UpgradeBehaviorChange[]} */
export const UPGRADE_BEHAVIOR_CHANGES = Object.freeze([
  Object.freeze({
    version: '4.8.20',
    note: 'coverage.symbol now requires a real declaration (some green repos turn red)',
  }),
  Object.freeze({
    version: '4.8.21',
    note: 'a bare mention of an invariant id no longer counts as coverage (only describe/it titles or declarations, incl. type/interface/enum)',
  }),
  Object.freeze({
    version: '4.8.21',
    note: "upgrade exit code 3 = applied but red. Scripts comparing against 1 must switch to 'non-zero'",
  }),
]);

/**
 * @param {string} version
 * @returns {number[]}
 */
function versionParts(version) {
  return String(version)
    .replace(/^v/, '')
    .split('.')
    .map((part) => {
      const match = /^(\d+)/.exec(part);
      return match ? Number(match[1]) : 0;
    });
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {-1|0|1}
 */
export function compareUpgradeVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * @param {UpgradeBehaviorChange} row
 * @returns {string}
 */
export function formatBehaviorChange(row) {
  return `${row.version}: ${row.note}`;
}

/**
 * Lines from the shipped table.
 * Omit `upTo` to return every note in this package (the post-upgrade default:
 * the build that implements a note must show it, even before the version bump).
 * Pass `upTo` to keep notes whose version is less than or equal to that release.
 *
 * @param {string} [upTo]
 * @returns {string[]}
 */
export function behaviorChangeLines(upTo) {
  const rows =
    typeof upTo === 'string' && upTo.trim()
      ? UPGRADE_BEHAVIOR_CHANGES.filter((row) => compareUpgradeVersions(row.version, upTo) <= 0)
      : UPGRADE_BEHAVIOR_CHANGES;
  return rows.map((row) => formatBehaviorChange(row));
}
