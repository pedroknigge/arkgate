/**
 * Packed front-door honesty — this tarball publishes as npm `latest`.
 *
 * A prepare-PR waiting-room banner ("latest remains older", "prepared on this
 * tree") is honest on git for a few hours and a lie the moment `npm publish`
 * packs the same files. Strangers read the tarball.
 */
const SEMVER = '([0-9]+\\.[0-9]+\\.[0-9]+)';
const LATEST_REMAINS = new RegExp(`latest remains\\s+\\*{0,2}${SEMVER}\\*{0,2}`, 'gi');
const PREPARED_ON_TREE = /is prepared on this tree/i;
const PREPARED_NOT_PUBLISHED = new RegExp(
  `Prepared\\s*\\(([^\\n)]*${SEMVER}[^\\n)]*);\\s*not published\\)`,
  'gi'
);
const PREPARED_LINK = new RegExp(`\\[${SEMVER} prepared\\]`, 'gi');
const NOT_PUBLISHED_UNTIL = /not published until/i;

export const PACKED_FRONT_DOORS = Object.freeze(['README.md', 'docs/README.md']);

export function changelogSectionForVersion(changelog, version) {
  if (typeof changelog !== 'string' || !version) return '';
  const heading = `## ${version} —`;
  const start = changelog.indexOf(heading);
  if (start === -1) return '';
  const from = start + heading.length;
  const next = changelog.indexOf('\n## ', from);
  return next === -1 ? changelog.slice(start) : changelog.slice(start, next);
}

function latestRemainsPins(text, packageVersion) {
  const pins = [];
  if (typeof text !== 'string' || !packageVersion) return pins;
  for (const match of text.matchAll(LATEST_REMAINS)) {
    if (match[1] !== packageVersion) {
      pins.push({ kind: 'latest-remains-older', pinned: match[1], excerpt: match[0] });
    }
  }
  return pins;
}

export function frontDoorStalePins(text, packageVersion) {
  const pins = latestRemainsPins(text, packageVersion);
  if (typeof text !== 'string' || !packageVersion) return pins;
  if (PREPARED_ON_TREE.test(text)) {
    pins.push({ kind: 'prepared-on-tree', excerpt: 'is prepared on this tree' });
  }
  for (const match of text.matchAll(PREPARED_NOT_PUBLISHED)) {
    if (match[2] === packageVersion || match[1]?.includes(packageVersion)) {
      pins.push({ kind: 'prepared-not-published', excerpt: match[0] });
    }
  }
  for (const match of text.matchAll(PREPARED_LINK)) {
    if (match[1] === packageVersion) {
      pins.push({ kind: 'prepared-link', excerpt: match[0] });
    }
  }
  if (NOT_PUBLISHED_UNTIL.test(text) && text.includes(packageVersion)) {
    pins.push({ kind: 'not-published-until', excerpt: 'not published until' });
  }
  return pins;
}

export function changelogStalePins(section, packageVersion) {
  return latestRemainsPins(section, packageVersion);
}

function formatPin(pin, version) {
  if (pin.kind === 'latest-remains-older') {
    return `claims npm latest remains ${pin.pinned} while this package is ${version}`;
  }
  return `${pin.kind} (${pin.excerpt}) while this package is ${version}`;
}

/**
 * @param {{
 *   version: string,
 *   readme?: string,
 *   docsReadme?: string,
 *   changelog?: string,
 * }} input
 * @returns {string[]}
 */
export function collectPackedFrontDoorErrors(input) {
  const version = input?.version;
  const errors = [];
  if (!version) {
    errors.push('package version is required');
    return errors;
  }
  const doors = [
    ['README.md', input.readme],
    ['docs/README.md', input.docsReadme],
  ];
  for (const [rel, text] of doors) {
    if (text == null) continue;
    for (const pin of frontDoorStalePins(text, version)) {
      errors.push(`${rel}: ${formatPin(pin, version)}`);
    }
  }
  if (input.changelog != null) {
    const section = changelogSectionForVersion(input.changelog, version);
    for (const pin of changelogStalePins(section, version)) {
      errors.push(`CHANGELOG.md (${version}): ${formatPin(pin, version)}`);
    }
  }
  return errors;
}
