/** Fail-closed completeness evidence for one proposed source snippet. */
import { ANALYSIS_COMPLETENESS } from './analysis-completeness.mjs';

function finding(ruleId, message, file, nextAction) {
  return {
    ruleId,
    code: ruleId,
    message,
    ...(file ? { file, filePath: file } : {}),
    nextAction,
  };
}

export function validateSnippetAnalysis({ gate, ts, source, context = {} }) {
  const observed = gate.validate(source, context);
  const base = {
    valid: Boolean(observed.valid),
    violations: Array.isArray(observed.violations) ? observed.violations : [],
  };
  const file = context.filePath;

  if (!ts || typeof ts.createSourceFile !== 'function') {
    return {
      valid: false,
      completeness: ANALYSIS_COMPLETENESS.unavailable,
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
      return {
        valid: false,
        completeness: ANALYSIS_COMPLETENESS.partial,
        violations: [
          ...base.violations,
          finding(
            'ANALYSIS_PARSE_INCOMPLETE',
            `Analysis partial: proposed source has ${diagnosticCount} parse diagnostic(s).`,
            file,
            'Fix the syntax until the TypeScript parser reports zero diagnostics, then validate again.'
          ),
        ],
      };
    }
    return {
      ...base,
      completeness: ANALYSIS_COMPLETENESS.complete,
    };
  } catch {
    return {
      valid: false,
      completeness: ANALYSIS_COMPLETENESS.unavailable,
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
