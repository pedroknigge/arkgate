/**
 * Machine-readable refusal for an invalid contract under `--json` / `--doctor --json`.
 * The human message still goes to stderr; stdout must never be empty for JSON consumers.
 */

/**
 * @param {unknown} error
 * @param {string[]} argv
 * @returns {string|null} JSON line for stdout, or null when not a config-contract error / not --json
 */
export function configInvalidJsonEnvelope(error, argv) {
  if (!argv.includes('--json')) return null;
  const e = /** @type {{ name?: string, issues?: Array<{path: string, message: string}>, source?: string }} */ (error);
  if (e?.name !== 'ArkConfigValidationError' || !Array.isArray(e.issues)) return null;
  return JSON.stringify({
    ok: false,
    error: 'CONFIG_INVALID',
    configPath: e.source,
    messages: e.issues.map((issue) => `${issue.path}: ${issue.message}`),
  });
}
