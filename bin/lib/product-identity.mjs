import fs from 'node:fs';
import path from 'node:path';

export const PRODUCT_NAME = 'Structrail';
export const LEGACY_PRODUCT_NAME = 'ArkGate';
export const CANONICAL_CONFIG_NAME = 'structrail.config.json';
export const LEGACY_CONFIG_NAME = 'ark.config.json';

export function isStructrailInvocation(invocationPath = process.argv[1]) {
  return path.basename(invocationPath ?? '').startsWith('structrail');
}

function configDeprecation(configPath) {
  return {
    code: 'legacy-config-filename',
    path: configPath,
    replacement: CANONICAL_CONFIG_NAME,
    message: `${LEGACY_CONFIG_NAME} is deprecated; rename it to ${CANONICAL_CONFIG_NAME} before v4.`,
  };
}

export function resolveConfigIdentity({ root, requested, explicit, primary }) {
  if (explicit) {
    return {
      config: requested,
      deprecations:
        primary && path.basename(requested) === LEGACY_CONFIG_NAME
          ? [configDeprecation(requested)]
          : [],
    };
  }

  const canonicalPath = path.join(root, CANONICAL_CONFIG_NAME);
  const legacyPath = path.join(root, LEGACY_CONFIG_NAME);
  const canonicalExists = fs.existsSync(canonicalPath);
  const legacyExists = fs.existsSync(legacyPath);

  if (canonicalExists && legacyExists) {
    return {
      error: 'ambiguous-config',
      message:
        `Both ${CANONICAL_CONFIG_NAME} and ${LEGACY_CONFIG_NAME} exist. ` +
        'Pass --config explicitly; Structrail will not guess which contract governs the project.',
      paths: [CANONICAL_CONFIG_NAME, LEGACY_CONFIG_NAME],
    };
  }
  if (canonicalExists) return { config: CANONICAL_CONFIG_NAME, deprecations: [] };
  if (legacyExists) {
    return {
      config: LEGACY_CONFIG_NAME,
      deprecations: primary ? [configDeprecation(LEGACY_CONFIG_NAME)] : [],
    };
  }
  return {
    config: requested ?? (primary ? CANONICAL_CONFIG_NAME : LEGACY_CONFIG_NAME),
    deprecations: [],
  };
}
