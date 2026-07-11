import fs from 'node:fs';
import path from 'node:path';

export const PRODUCT_NAME = 'Structrail';
export const LEGACY_PRODUCT_NAME = 'ArkGate';
export const CANONICAL_CONFIG_NAME = 'structrail.config.json';
export const LEGACY_CONFIG_NAME = 'ark.config.json';

export const STRUCTRAIL_GENERATION_IDENTITY = Object.freeze({
  primary: true,
  productName: PRODUCT_NAME,
  packageName: 'structrail',
  cliBin: 'structrail',
  checkBin: 'structrail-check',
  mcpBin: 'structrail-mcp',
  configName: CANONICAL_CONFIG_NAME,
  manifestResource: 'structrail://manifest',
  mcpServerKey: 'structrail',
  skillPrefix: 'structrail',
  skillVersionKey: 'structrailVersion',
  fileStem: 'structrail',
});

export const ARK_GENERATION_IDENTITY = Object.freeze({
  primary: false,
  productName: 'Ark',
  packageName: 'arkgate',
  cliBin: 'ark',
  checkBin: 'ark-check',
  mcpBin: 'arkgate-mcp',
  configName: LEGACY_CONFIG_NAME,
  manifestResource: 'ark://manifest',
  mcpServerKey: 'ark',
  skillPrefix: 'ark',
  skillVersionKey: 'arkVersion',
  fileStem: 'ark',
});

export function generationIdentity(primary) {
  return primary ? STRUCTRAIL_GENERATION_IDENTITY : ARK_GENERATION_IDENTITY;
}

export function generationIdentityForRoot(root) {
  if (fs.existsSync(path.join(root, CANONICAL_CONFIG_NAME))) {
    return STRUCTRAIL_GENERATION_IDENTITY;
  }
  try {
    const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    if (/^#\s*Structrail\s+Enforcement\b/m.test(agents)) {
      return STRUCTRAIL_GENERATION_IDENTITY;
    }
  } catch {
    /* no generated agent contract */
  }
  try {
    const mcp = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
    if (mcp?.mcpServers?.structrail) return STRUCTRAIL_GENERATION_IDENTITY;
  } catch {
    /* no generated MCP config */
  }
  return ARK_GENERATION_IDENTITY;
}

export function isStructrailInvocation(invocationPath = process.argv[1]) {
  return path.basename(invocationPath ?? '').startsWith('structrail');
}

function envTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? '').trim());
}

export function resolveBooleanEnvironment(env, canonicalName, legacyName) {
  const hasCanonical = Object.prototype.hasOwnProperty.call(env, canonicalName);
  const hasLegacy = Object.prototype.hasOwnProperty.call(env, legacyName);
  const canonicalValue = hasCanonical ? envTruthy(env[canonicalName]) : undefined;
  const legacyValue = hasLegacy ? envTruthy(env[legacyName]) : undefined;
  return {
    value: hasCanonical ? canonicalValue : (legacyValue ?? false),
    source: hasCanonical ? canonicalName : hasLegacy ? legacyName : null,
    conflict: hasCanonical && hasLegacy && canonicalValue !== legacyValue,
  };
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
