/**
 * Report channels for Ark ESLint rules.
 *
 * ESLint picks a report's severity from the rule's configured level; a report descriptor
 * cannot carry its own severity. So a soft-capable rule (one whose findings can be
 * non-blocking: `failsStrict: false` → adapter severity `warning`) has two outlets:
 *
 * - its own blocking rule id (`ark/no-domain-infra-imports`, …) for findings that fail
 *   ark-check;
 * - `ark/architecture-advisory` for findings ark-check reports as warnings.
 *
 * One evaluation per file and rule: whichever enabled rule is created first for a file
 * builds the evaluator's listeners; the other gets none. Each report is routed at report
 * time to the rule that owns it. When `ark/architecture-advisory` is not enabled for the
 * file (a hand-written config that turns on single rules), non-blocking findings fall back
 * to the blocking rule id, tagged as advisory, so they are never silently dropped.
 *
 * Sharing is keyed on ESLint's per-run file context (the prototype every rule context of
 * one lint run inherits `sourceCode` from — ESLint 8, 9 and 10), so a reused SourceCode
 * object or a context wrapper (`fixupRule`) never leaks state across runs or rules.
 */
import type { ArkRule, RuleContext, RuleListener } from './ruleSupport';

export type ReportChannel = 'blocking' | 'advisory';

export const ADVISORY_MESSAGE_ID = 'advisory';
export const ADVISORY_MESSAGE = '{{message}} [{{ruleId}}; advisory — does not fail ark-check]';
/** Blocking rule id carrying a non-blocking finding (advisory rule not enabled). */
export const ADVISORY_FALLBACK_MESSAGE_ID = 'advisoryFallback';
export const ADVISORY_FALLBACK_MESSAGE =
  '{{message}} [{{ruleId}}; advisory — does not fail ark-check. Enable ark/architecture-advisory (set to "warn" in configs.recommended) to report it as a warning.]';

type SharedEvaluation = {
  sinks: Partial<Record<ReportChannel, RuleContext>>;
  created: boolean;
};

const evaluationsByRun = new WeakMap<object, Map<ArkRule, SharedEvaluation>>();
const evaluationForContext = new WeakMap<object, SharedEvaluation>();

function ownsSourceCode(candidate: object): boolean {
  return (
    Object.prototype.hasOwnProperty.call(candidate, 'sourceCode') ||
    Object.prototype.hasOwnProperty.call(candidate, 'getSourceCode')
  );
}

/** Per-run object shared by every rule context of one file lint, or null. */
function runKey(context: RuleContext): object | null {
  let current: object | null = context;
  for (let depth = 0; current && current !== Object.prototype && depth < 8; depth += 1) {
    if (ownsSourceCode(current)) {
      // ESLint builds each rule context on top of the per-run file context; a context
      // that owns `sourceCode` itself is unique per rule, so it cannot be shared.
      return current === context ? null : current;
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return null;
}

function routedContext(base: RuleContext, evaluation: SharedEvaluation): RuleContext {
  const routed = Object.create(base, {
    report: {
      value(descriptor: Record<string, unknown>) {
        evaluation.sinks.blocking?.report(descriptor);
      },
    },
  }) as RuleContext;
  evaluationForContext.set(routed, evaluation);
  return routed;
}

/**
 * Listeners for `rule` on one channel. The first channel created for a file runs the
 * evaluator; later channels register as report sinks only.
 */
export function createChannelListeners(
  rule: ArkRule,
  context: RuleContext,
  channel: ReportChannel
): RuleListener {
  const key = runKey(context);
  let evaluation: SharedEvaluation | undefined;
  if (key) {
    let byRule = evaluationsByRun.get(key);
    if (!byRule) {
      byRule = new Map();
      evaluationsByRun.set(key, byRule);
    }
    evaluation = byRule.get(rule);
    if (!evaluation) {
      evaluation = { sinks: {}, created: false };
      byRule.set(rule, evaluation);
    }
  } else {
    evaluation = { sinks: {}, created: false };
  }
  evaluation.sinks[channel] = context;
  if (evaluation.created) return {};
  evaluation.created = true;
  return rule.create(routedContext(context, evaluation));
}

export type RoutedReport = {
  nonBlocking: boolean;
  location: Record<string, unknown>;
  messageId: string;
  data?: Record<string, unknown>;
  advisoryData: Record<string, unknown>;
  diagnostic: unknown;
};

/**
 * Deliver one Ark finding. Contexts that did not come from createChannelListeners
 * (direct `rule.create(ctx)` callers) receive every finding on their own id.
 */
export function deliverReport(context: RuleContext, report: RoutedReport): void {
  const evaluation = evaluationForContext.get(context);
  const { location, diagnostic } = report;
  const blockingDescriptor = {
    ...location,
    messageId: report.messageId,
    ...(report.data ? { data: report.data } : {}),
    diagnostic,
  };
  if (!evaluation) {
    context.report(
      report.nonBlocking
        ? { ...location, messageId: ADVISORY_FALLBACK_MESSAGE_ID, data: report.advisoryData, diagnostic }
        : blockingDescriptor
    );
    return;
  }
  if (!report.nonBlocking) {
    evaluation.sinks.blocking?.report(blockingDescriptor);
    return;
  }
  if (evaluation.sinks.advisory) {
    evaluation.sinks.advisory.report({
      ...location,
      messageId: ADVISORY_MESSAGE_ID,
      data: report.advisoryData,
      diagnostic,
    });
    return;
  }
  evaluation.sinks.blocking?.report({
    ...location,
    messageId: ADVISORY_FALLBACK_MESSAGE_ID,
    data: report.advisoryData,
    diagnostic,
  });
}
