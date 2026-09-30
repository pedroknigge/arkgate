/** Fail-closed completeness evidence for one proposed source snippet. */
import { layerForRelativePath } from '../ark-layer-match.mjs';
import { ANALYSIS_COMPLETENESS } from './analysis-completeness.mjs';
import { evaluateArkRunEditorSensorsFromSource } from './ark-run-sensors.mjs';
import { evaluateArkOrderEditorSensors } from './ark-order-sensors.mjs';
import {
  buildArkRuleFileHints,
  evaluateArkRuleSensors,
  extractClassShapesFromSource,
} from './arkrules-sensors.mjs';
import { getDiagnosticCatalogEntry } from './diagnostic-catalog.mjs';
import { demoteExtraPlaneTeethUnderClassificationFloor } from './extra-merge-teeth.mjs';

/** Hook-only guidance: a hook deny is already the verdict for that write. */
const HOOK_DENY_PREPARE_CHANGE_NOTE = 'Do not call ark_prepare_change from a hook deny.';

function surfaceNote(context) {
  return context?.surface === 'hook' ? ` ${HOOK_DENY_PREPARE_CHANGE_NOTE}` : '';
}

function lexicalEvidenceIncompleteMessage(file, context) {
  const entry = getDiagnosticCatalogEntry('LEXICAL_EVIDENCE_INCOMPLETE');
  const text = [entry?.why, entry?.fix].filter(Boolean).join(' ');
  return {
    code: 'LEXICAL_EVIDENCE_INCOMPLETE',
    message:
      (text ||
        'This check only saw one file, so it cannot fully prove how the import resolves. The result is provisional — `ark-check` on the project is the authority. For a complete verdict, run `npx arkgate-check --root . --config ark.config.json` (or ark_prepare_change over MCP with the full candidate batch).') +
      surfaceNote(context),
    ...(file ? { file } : {}),
  };
}

export function flattenTsParseDiagnostics(ts, diagnostics, sourceFile) {
  if (!Array.isArray(diagnostics) || !ts) return [];
  return diagnostics.map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    let line = 1;
    let column = 1;
    if (typeof diagnostic.start === 'number' && sourceFile?.getLineAndCharacterOfPosition) {
      const pos = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
      line = (pos.line ?? 0) + 1;
      column = (pos.character ?? 0) + 1;
    }
    return {
      line,
      column,
      message: String(message || '').trim() || 'parse error',
      code: diagnostic.code,
    };
  });
}

function finding(ruleId, message, file, nextAction) {
  return {
    ruleId,
    code: ruleId,
    message,
    ...(file ? { file, filePath: file } : {}),
    nextAction,
  };
}

function arkRunSnippetViolations(source, context = {}) {
  const extra = context.arkRun;
  const layers = context.layers;
  const file = context.relFile || context.filePath;
  if (!extra || !Array.isArray(layers) || typeof file !== 'string' || file.length === 0) {
    return [];
  }
  const layerForFile = (pathValue) => {
    if (pathValue === file && typeof context.layer === 'string') return context.layer;
    return layerForRelativePath(pathValue, layers);
  };
  const { findings } = evaluateArkRunEditorSensorsFromSource({
    arkRun: extra,
    layers,
    file,
    source,
    layerForFile,
    classification: context.classification,
  });
  return findings
    .filter((finding) => finding.failsStrict)
    .map((finding) => ({
      ruleId: finding.ruleId,
      code: finding.ruleId,
      message: finding.message,
      file: finding.file,
      line: finding.line,
      fromLayer: finding.fromLayer,
      target: finding.target,
      nextAction: finding.nextAction,
      failsStrict: true,
      severity: 'error',
    }));
}

const TS_CLASS_SHAPE_FILE = /\.(tsx?|mts|cts)$/i;

/**
 * File-local ArkRules structure sensors on the proposed source — the same sensors,
 * class-shape extraction, and per-file hints ark-check runs, pinned to this one file.
 * Only enforced (failsStrict) findings block; advisory rules stay CI/doctor warnings.
 */
function arkRulesSnippetViolations(source, context = {}) {
  const arkRules = context.arkRules;
  const file = context.relFile;
  if (!arkRules || !(arkRules.structure?.length > 0) || typeof file !== 'string' || !file) {
    return [];
  }
  const layers = Array.isArray(context.layers) ? context.layers : [];
  const layerForFile = (pathValue) =>
    pathValue === file && typeof context.layer === 'string'
      ? context.layer
      : layerForRelativePath(pathValue, layers);
  let classShapes = [];
  if (TS_CLASS_SHAPE_FILE.test(file)) {
    try {
      classShapes = extractClassShapesFromSource(file, source);
    } catch {
      // Same as the CI resolver: shape extraction never fails the run.
      classShapes = [];
    }
  }
  const findings = evaluateArkRuleSensors({
    arkRules,
    classShapes,
    files: [file],
    layerForFile,
    fileHints: buildArkRuleFileHints({ [file]: source }),
  });
  // Same classification floor ark-check applies before merge (teeth only on a classified tree).
  return demoteExtraPlaneTeethUnderClassificationFloor(findings, context.classification ?? {})
    .filter((finding) => finding.failsStrict)
    .map((finding) => ({
      ...finding,
      nextAction:
        getDiagnosticCatalogEntry('ARKRULE_STRUCTURE')?.fix ??
        'Fix the ArkRules structure finding in this file, then retry the write.',
      failsStrict: true,
      severity: 'error',
    }));
}

/** ArkOrder editor sensors (generic update, kernel-in-domain, ξ writes) on one source. */
function arkOrderSnippetViolations(source, context = {}) {
  const arkOrder = context.arkOrder;
  const file = context.relFile;
  if (!arkOrder || typeof file !== 'string' || !file) return [];
  const layers = Array.isArray(context.layers) ? context.layers : [];
  const fromLayer =
    typeof context.layer === 'string' ? context.layer : layerForRelativePath(file, layers);
  const layerMeta = layers.find((layer) => layer?.name === fromLayer);
  return evaluateArkOrderEditorSensors({
    arkOrder,
    file,
    source,
    fromLayer,
    intentPrefixes: layerMeta?.intentPrefixes ?? [],
    ...(context.classification ? { classification: context.classification } : {}),
  })
    .filter((finding) => finding.failsStrict)
    .map((finding) => ({
      ruleId: finding.ruleId,
      code: finding.ruleId,
      message: finding.message,
      file: finding.file,
      line: finding.line,
      ...(finding.fromLayer ? { fromLayer: finding.fromLayer } : {}),
      ...(finding.target ? { target: finding.target } : {}),
      nextAction: finding.nextAction,
      failsStrict: true,
      severity: 'error',
    }));
}

/**
 * The write gate could not load part of its own contract (e.g. a referenced ArkRules
 * file is missing). CI fails closed on the same input, so the write path does too.
 */
function contractLoadViolations(context = {}) {
  const errors = Array.isArray(context.contractErrors) ? context.contractErrors : [];
  return errors.map((error) => ({
    ruleId: 'WRITE_GATE_UNAVAILABLE',
    code: 'WRITE_GATE_UNAVAILABLE',
    message: `Invalid Effective Contract: ${
      typeof error === 'string' ? error : `${error?.path ?? ''}: ${error?.message ?? ''}`.trim()
    }`,
    ...(context.relFile ? { file: context.relFile } : {}),
    nextAction:
      getDiagnosticCatalogEntry('WRITE_GATE_UNAVAILABLE')?.fix ??
      'Fix the ArkRules reference in ark.config.json, then retry the write.',
    failsStrict: true,
    severity: 'error',
  }));
}

/**
 * Extras (ArkRules structure + ArkOrder) run only on files CI would scan. A file
 * outside include / excluded is never judged by these planes in CI either.
 */
function extraPlaneSnippetViolations(source, context = {}) {
  if (context.inScope === false) return [];
  return [
    ...contractLoadViolations(context),
    ...arkRulesSnippetViolations(source, context),
    ...arkOrderSnippetViolations(source, context),
  ];
}

export function validateSnippetAnalysis({ gate, ts, source, context = {} }) {
  const observed = gate.validate(source, context);
  const arkRunViolations = arkRunSnippetViolations(source, context);
  const extraViolations = extraPlaneSnippetViolations(source, context);
  const base = {
    valid:
      Boolean(observed.lexicalValid ?? observed.valid) &&
      arkRunViolations.length === 0 &&
      extraViolations.length === 0,
    violations: [
      ...(Array.isArray(observed.violations) ? observed.violations : []),
      ...arkRunViolations,
      ...extraViolations,
    ],
  };
  const file = context.filePath;

  if (!ts || typeof ts.createSourceFile !== 'function') {
    return {
      mode: 'lexical-compatibility',
      valid: false,
      lexicalValid: false,
      completeness: ANALYSIS_COMPLETENESS.unavailable,
      completenessReasons: [
        {
          code: 'ANALYSIS_HOST_UNAVAILABLE',
          message: 'No API-compatible TypeScript host parsed the proposed source.',
          ...(file ? { file } : {}),
        },
      ],
      violations: [
        ...base.violations,
        finding(
          'ANALYSIS_HOST_UNAVAILABLE',
          'Analysis unavailable: no API-compatible TypeScript host parsed the proposed source.',
          file,
          'Restore ArkGate\'s TypeScript analysis host, then validate the complete source again.'
        ),
      ],
    };
  }

  try {
    const parsed = ts.createSourceFile(
      file || 'generated.ts',
      source,
      ts.ScriptTarget.Latest,
      true
    );
    if (!Array.isArray(parsed.parseDiagnostics)) throw new Error('parse diagnostics unavailable');
    const diagnosticCount = parsed.parseDiagnostics.length;
    if (diagnosticCount > 0) {
      const tsDiagnostics = flattenTsParseDiagnostics(ts, parsed.parseDiagnostics, parsed);
      const first = tsDiagnostics[0];
      const detail = first
        ? `line ${first.line}: ${first.message}`
        : `${diagnosticCount} parse diagnostic(s)`;
      return {
        mode: 'lexical-compatibility',
        valid: false,
        lexicalValid: false,
        completeness: ANALYSIS_COMPLETENESS.partial,
        completenessReasons: [
          {
            code: 'ANALYSIS_PARSE_INCOMPLETE',
            message: `The proposed source has ${diagnosticCount} parse diagnostic(s). ${detail}`,
            ...(file ? { file } : {}),
            line: first?.line,
            tsDiagnostics,
          },
        ],
        violations: [
          ...base.violations,
          {
            ...finding(
              'ANALYSIS_PARSE_INCOMPLETE',
              `Analysis partial: ${detail}`,
              file,
              'Incremental mid-edit parse errors are normal. Finish the source, then re-run `npx arkgate-check` (or the write hook).' +
                surfaceNote(context)
            ),
            line: first?.line ?? 1,
            column: first?.column ?? 1,
            evidence: { tsDiagnostics, diagnosticCount },
          },
        ],
      };
    }
    return {
      ...base,
      mode: 'lexical-compatibility',
      valid: false,
      lexicalValid: base.valid,
      completeness: ANALYSIS_COMPLETENESS.partial,
      completenessReasons: [lexicalEvidenceIncompleteMessage(file, context)],
    };
  } catch {
    return {
      mode: 'lexical-compatibility',
      valid: false,
      lexicalValid: false,
      completeness: ANALYSIS_COMPLETENESS.unavailable,
      completenessReasons: [
        {
          code: 'ANALYSIS_HOST_UNAVAILABLE',
          message: 'The TypeScript host could not parse the proposed source.',
          ...(file ? { file } : {}),
        },
      ],
      violations: [
        ...base.violations,
        finding(
          'ANALYSIS_HOST_UNAVAILABLE',
          'Analysis unavailable: the TypeScript host could not parse the proposed source.',
          file,
          'Restore ArkGate\'s TypeScript analysis host, then validate the complete source again.'
        ),
      ],
    };
  }
}
