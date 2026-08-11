/**
 * Suggested improvements / what’s new after `ark upgrade` (advisory).
 *
 * Product capability list so consumers know what to try or inspect after
 * installing this package line. Always notAScore / never a gate input.
 * Pure constants — no git, no LLM, no invented residual.
 */

export const UPGRADE_WHATS_NEW_SCHEMA_VERSION = '1.0';

/**
 * Closed list of post-upgrade suggestions for this product line.
 * Ids are stable for agents; titles/try/inspect are human-facing.
 *
 * @returns {{
 *   schemaVersion: typeof UPGRADE_WHATS_NEW_SCHEMA_VERSION,
 *   notAScore: true,
 *   neverGateInput: true,
 *   title: string,
 *   items: Array<{
 *     id: string,
 *     title: string,
 *     try: string,
 *     inspect: string,
 *     why: string,
 *   }>,
 * }}
 */
export function buildUpgradeWhatsNewSuggestions() {
  return {
    schemaVersion: UPGRADE_WHATS_NEW_SCHEMA_VERSION,
    notAScore: true,
    neverGateInput: true,
    title: 'Suggested improvements — try or inspect after this package',
    items: [
      {
        id: 'deep-module-coach',
        title: 'Deep-module coach (hot paths + deepening)',
        try: 'npx arkgate-check --doctor',
        inspect:
          'doctor.deepModuleCoach (JSON) or HTML data-advisory="deepModuleCoach"',
        why:
          'See recent-churn hot paths and deepening candidates projected only from existing residual. Always notAScore; never invents paths; never flips the gate.',
      },
      {
        id: 'improvement-compass',
        title: 'Improvement compass (residual lenses)',
        try: 'npx arkgate-check --doctor',
        inspect: 'doctor.improvementCompass or HTML data-advisory="improvementCompass"',
        why:
          'Named residual architecture lenses (SoC, DIP, domain, …) from evidence you already have — not a score; never flips valid / strict-merge / goal.met.',
      },
      {
        id: 'session-status-honesty',
        title: 'Session recipe + status honesty',
        try: 'npx arkgate status --json',
        inspect: 'status.improvementCompass.mode (full | subset | unavailable)',
        why:
          'Bind identity → status → act. Incomplete facts never invent green residual; when mode is not full, run doctor for the full residual map.',
      },
      {
        id: 'two-axis-done',
        title: 'Two-axis done (Enforce green ≠ feature done)',
        try: 'Read docs/agent-guide.md “Two-axis done” and your ticket/spec',
        inspect: 'Architecture residual (doctor/compass) vs feature residual (your acceptance)',
        why:
          'Gate green only clears architecture residual. Feature/ticket acceptance stays outside the package — no package LLM verdict for “done.”',
      },
      {
        id: 'upgrade-self-service',
        title: 'Upgrade self-service honesty',
        try: 'npx arkgate upgrade --json',
        inspect: 'selfService (write-path labels + customized preserve)',
        why:
          'After managed upgrade, learn write-path hard|advisory|unavailable per host and whether customized content was preserved — without a maintainer ticket. Soft hosts never claim hard.',
      },
      {
        id: 'registry-aware-upgrade',
        title: 'Registry-aware package upgrade (FX field truth)',
        try: 'npx arkgate upgrade --apply',
        inspect:
          'packageInstallSkipped / reasonCode / registryLatest / suggestedInstallCmd (JSON)',
        why:
          'When CLI version equals node_modules but npm registry is ahead, upgrade no longer false-skips. Offline/registry-unknown stays honest with a copy-paste install command.',
      },
      {
        id: 'skill-drift-refresh',
        title: 'Skill content drift + opt-in refresh',
        try: 'npx arkgate upgrade --json',
        inspect: 'skillDrift (+ --refresh-skills for customized skill rewrite consent)',
        why:
          'See stale/customized/missing skill counts. Customized skills stay preserved unless you pass --refresh-skills; never silent overwrite of true edits.',
      },
      {
        id: 'mcp-multi-project',
        title: 'Multi-project MCP process honesty',
        try: 'ark_identity with project.expectedRoot; read processPackage on every tool',
        inspect: 'processPackage.processPackageMismatch / processStale + nextAction',
        why:
          'One user, many checkouts: after package bump, restart MCP so process arkgateVersion matches install. Prefer project-local CLI until identity matched and versions align.',
      },
    ],
  };
}

/**
 * Human lines for upgrade preview/apply stdout.
 * @param {ReturnType<typeof buildUpgradeWhatsNewSuggestions>} [whatsNew]
 * @returns {string[]}
 */
export function formatUpgradeWhatsNewSuggestions(whatsNew) {
  const payload = whatsNew && typeof whatsNew === 'object' ? whatsNew : buildUpgradeWhatsNewSuggestions();
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) return [];
  const lines = [
    payload.title || 'Suggested improvements — try or inspect after this package',
    '  (advisory only — not a score; never changes gate verdicts)',
  ];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title) continue;
    lines.push(`  • ${title}`);
    if (typeof item.try === 'string' && item.try.trim()) {
      lines.push(`      try: ${item.try.trim()}`);
    }
    if (typeof item.inspect === 'string' && item.inspect.trim()) {
      lines.push(`      inspect: ${item.inspect.trim()}`);
    }
    if (typeof item.why === 'string' && item.why.trim()) {
      lines.push(`      why: ${item.why.trim()}`);
    }
  }
  return lines;
}
