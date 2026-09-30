/**
 * Shared, pure helpers for the observability dashboard CLI (`ark-dashboard`,
 * `arkgate-dashboard`, and the `ark dashboard` passthrough). No I/O here.
 */

export const DASHBOARD_DEFAULT_INTERVAL_MS = 2000;
export const DASHBOARD_DEFAULT_TIMEOUT_MS = 5000;
export const DASHBOARD_DEFAULT_URL = 'http://127.0.0.1:3000/snapshot';
const DASHBOARD_MIN_MS = 200;
const DASHBOARD_MAX_MS = 60_000;

export const DASHBOARD_HELP = `arkgate-dashboard (alias ark-dashboard, ark dashboard) — observability TUI.
Usage: arkgate-dashboard [--url <inspector-url>] [--interval <ms>] [--timeout <ms>] [--once]
Polls an ArkRun inspector; it does not start the kernel.

  -u, --url <url>        Inspector URL: handle.url (root) or handle.snapshotUrl.
                         Default: $ARK_DASHBOARD_URL, else ${DASHBOARD_DEFAULT_URL}.
                         startInspector() binds a random port unless you pass
                         { port }, so pass the URL your app printed.
  -i, --interval <ms>    Poll interval, clamped to ${DASHBOARD_MIN_MS}-${DASHBOARD_MAX_MS} (default ${DASHBOARD_DEFAULT_INTERVAL_MS}).
  -t, --timeout <ms>     Fetch timeout, clamped to ${DASHBOARD_MIN_MS}-${DASHBOARD_MAX_MS} (default ${DASHBOARD_DEFAULT_TIMEOUT_MS}).
      --once             Render one frame and exit (non-zero when the kernel is unreachable).
  -h, --help             Show this help.
  -v, --version          Print the arkgate version.`;

export const DASHBOARD_EPHEMERAL_PORT_HINT =
  'Hint: startInspector() binds a random port by default (port 0). Pass --url <handle.url> ' +
  '(printed by your app), set ARK_DASHBOARD_URL, or start the inspector with startInspector({ port: 3000 }).';

/**
 * Clamp a millisecond flag into [min, max]. Non-numeric input uses the default.
 * @param {string | undefined} raw
 * @param {number} fallback
 */
export function clampDashboardMs(raw, fallback) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(DASHBOARD_MAX_MS, Math.max(DASHBOARD_MIN_MS, parsed));
}

/**
 * Derive a sibling inspector route (`/outbox`, `/workflows`) from the URL the
 * user passed. Accepts the inspector root (`handle.url`, with or without a
 * trailing slash), `/snapshot`, `/snapshot/`, and prefix mounts (`/x/snapshot`).
 * @param {string} inspectorUrl
 * @param {string} suffix e.g. '/outbox'
 * @returns {string | null}
 */
export function dashboardSiblingUrl(inspectorUrl, suffix) {
  try {
    const u = new URL(inspectorUrl);
    let basePath = u.pathname.replace(/\/+$/, '');
    if (basePath.endsWith('/snapshot')) basePath = basePath.slice(0, -'/snapshot'.length);
    u.pathname = `${basePath}${suffix}`;
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}
