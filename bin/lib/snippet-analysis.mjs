/** Fail-closed completeness evidence for one proposed source snippet. */
import { layerForRelativePath } from '../ark-layer-match.mjs';
import { ANALYSIS_COMPLETENESS } from './analysis-completeness.mjs';
import { evaluateArkRunEditorSensorsFromSource } from './ark-run-sensors.mjs';

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

export function validateSnippetAnalysis({ gate, ts, source, context = {} }) {
  const observed = gate.validate(source, context);
  const arkRunViolations = arkRunSnippetViolations(source, context);
  const base = {
    valid: Boolean(observed.lexicalValid ?? observed.valid) && arkRunViolations.length === 0,
    violations: [
      ...(Array.isArray(observed.violations) ? observed.violations : []),
      ...arkRunViolations,
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
              'Incremental mid-edit parse errors are normal. Finish the source, then re-run `npx arkgate-check` (or the write hook). Do not call ark_prepare_change from a hook deny.'
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
      completenessReasons: [
        {
          code: 'LEXICAL_EVIDENCE_INCOMPLETE',
          message:
            'Single-file validation cannot prove project module resolution. The write hook is already the verdict, or re-run `npx arkgate-check --root . --config ark.config.json`. Do not call ark_prepare_change from a hook deny.',
          ...(file ? { file } : {}),
        },
      ],
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
