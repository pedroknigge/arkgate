import type {
  ArchitectureChangeMapContract,
  ArchitectureChangeOperation,
} from './changeMap';

export type ArchitectureDependency = { from: string; to: string };

export type ArchitectureActualChange = {
  path: string;
  operation: ArchitectureChangeOperation;
};

export type ArchitectureConvergenceClassification =
  | 'satisfied'
  | 'missing'
  | 'contradictory'
  | 'unplanned';

export type ArchitectureConvergenceFinding = {
  id: string;
  classification: ArchitectureConvergenceClassification;
  subject: 'file' | 'dependency';
  message: string;
  path?: string;
  from?: string;
  to?: string;
  expectedOperation?: ArchitectureChangeOperation;
  actualOperation?: ArchitectureChangeOperation | 'added' | 'removed';
};

export type ArchitectureConvergenceResult = {
  schemaVersion: '1.0';
  readOnly: true;
  changeMapHash: string;
  structurallyConverged: boolean;
  behavioralCompletion: 'not-evaluated';
  summary: Record<ArchitectureConvergenceClassification, number>;
  findings: ArchitectureConvergenceFinding[];
};

export type AnalyzeArchitectureConvergenceInput = {
  changeMap: ArchitectureChangeMapContract;
  changes: readonly ArchitectureActualChange[];
  baseDependencies: readonly ArchitectureDependency[];
  candidateDependencies: readonly ArchitectureDependency[];
};

function dependencyKey(dependency: ArchitectureDependency): string {
  return `${dependency.from}->${dependency.to}`;
}

function dependencyFinding(
  classification: ArchitectureConvergenceClassification,
  dependency: ArchitectureDependency,
  message: string,
  suffix = 'dependency'
): ArchitectureConvergenceFinding {
  return {
    id: `${classification}:${suffix}:${dependencyKey(dependency)}`,
    classification,
    subject: 'dependency',
    from: dependency.from,
    to: dependency.to,
    message,
  };
}

export function analyzeArchitectureConvergence(
  input: AnalyzeArchitectureConvergenceInput
): ArchitectureConvergenceResult {
  const findings: ArchitectureConvergenceFinding[] = [];
  const plannedFiles = new Map(input.changeMap.map.files.map((file) => [file.path, file]));
  const actualChanges = new Map(input.changes.map((change) => [change.path, change]));
  const plannedDependencies = new Map(
    input.changeMap.map.dependencies.map((dependency) => [dependencyKey(dependency), dependency])
  );
  const baseDependencies = new Map(
    input.baseDependencies.map((dependency) => [dependencyKey(dependency), dependency])
  );
  const candidateDependencies = new Map(
    input.candidateDependencies.map((dependency) => [dependencyKey(dependency), dependency])
  );

  for (const planned of [...plannedFiles.values()].sort((left, right) =>
    left.path.localeCompare(right.path)
  )) {
    const actual = actualChanges.get(planned.path);
    if (!actual) {
      findings.push({
        id: `missing:file:${planned.path}`,
        classification: 'missing',
        subject: 'file',
        path: planned.path,
        expectedOperation: planned.operation,
        message: `${planned.path} was planned as ${planned.operation} but is absent from the actual change.`,
      });
    } else if (actual.operation !== planned.operation) {
      findings.push({
        id: `contradictory:file:${planned.path}`,
        classification: 'contradictory',
        subject: 'file',
        path: planned.path,
        expectedOperation: planned.operation,
        actualOperation: actual.operation,
        message: `${planned.path} was planned as ${planned.operation} but the actual operation is ${actual.operation}.`,
      });
    } else {
      findings.push({
        id: `satisfied:file:${planned.path}`,
        classification: 'satisfied',
        subject: 'file',
        path: planned.path,
        expectedOperation: planned.operation,
        actualOperation: actual.operation,
        message: `${planned.path} matches the planned ${planned.operation} operation.`,
      });
    }
  }

  for (const actual of [...actualChanges.values()].sort((left, right) =>
    left.path.localeCompare(right.path)
  )) {
    if (plannedFiles.has(actual.path)) continue;
    findings.push({
      id: `unplanned:file:${actual.path}`,
      classification: 'unplanned',
      subject: 'file',
      path: actual.path,
      actualOperation: actual.operation,
      message: `${actual.path} has an unplanned ${actual.operation} operation.`,
    });
  }

  const contradictoryActualEdges = new Set<string>();
  for (const planned of [...plannedDependencies.values()].sort((left, right) =>
    dependencyKey(left).localeCompare(dependencyKey(right))
  )) {
    if (candidateDependencies.has(dependencyKey(planned))) {
      findings.push(
        dependencyFinding(
          'satisfied',
          planned,
          `${planned.from} -> ${planned.to} exists in the candidate architecture.`
        )
      );
      continue;
    }
    const reverse = { from: planned.to, to: planned.from };
    if (candidateDependencies.has(dependencyKey(reverse))) {
      contradictoryActualEdges.add(dependencyKey(reverse));
      findings.push(
        dependencyFinding(
          'contradictory',
          planned,
          `${planned.from} -> ${planned.to} was planned, but the candidate contains the reverse edge.`
        )
      );
    } else {
      findings.push(
        dependencyFinding(
          'missing',
          planned,
          `${planned.from} -> ${planned.to} is absent from the candidate architecture.`
        )
      );
    }
  }

  const relevantPaths = new Set([...plannedFiles.keys(), ...actualChanges.keys()]);
  for (const [key, actual] of [...candidateDependencies].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    if (
      baseDependencies.has(key) ||
      plannedDependencies.has(key) ||
      contradictoryActualEdges.has(key) ||
      (!relevantPaths.has(actual.from) && !relevantPaths.has(actual.to))
    ) {
      continue;
    }
    findings.push({
      ...dependencyFinding(
        'unplanned',
        actual,
        `${actual.from} -> ${actual.to} was added without a matching planned dependency.`,
        'dependency-added'
      ),
      actualOperation: 'added',
    });
  }

  const plannedDeletes = new Set(
    input.changeMap.map.files
      .filter((file) => file.operation === 'delete')
      .map((file) => file.path)
  );
  for (const [key, actual] of [...baseDependencies].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    if (
      candidateDependencies.has(key) ||
      plannedDeletes.has(actual.from) ||
      plannedDeletes.has(actual.to) ||
      (!relevantPaths.has(actual.from) && !relevantPaths.has(actual.to))
    ) {
      continue;
    }
    findings.push({
      ...dependencyFinding(
        'unplanned',
        actual,
        `${actual.from} -> ${actual.to} was removed without a planned file deletion.`,
        'dependency-removed'
      ),
      actualOperation: 'removed',
    });
  }

  const classificationOrder: Record<ArchitectureConvergenceClassification, number> = {
    satisfied: 0,
    missing: 1,
    contradictory: 2,
    unplanned: 3,
  };
  findings.sort(
    (left, right) =>
      classificationOrder[left.classification] - classificationOrder[right.classification] ||
      (left.subject === right.subject ? 0 : left.subject === 'file' ? -1 : 1) ||
      left.id.localeCompare(right.id)
  );
  const summary = {
    satisfied: findings.filter((finding) => finding.classification === 'satisfied').length,
    missing: findings.filter((finding) => finding.classification === 'missing').length,
    contradictory: findings.filter((finding) => finding.classification === 'contradictory').length,
    unplanned: findings.filter((finding) => finding.classification === 'unplanned').length,
  };

  return {
    schemaVersion: '1.0',
    readOnly: true,
    changeMapHash: input.changeMap.hash,
    structurallyConverged:
      summary.missing === 0 && summary.contradictory === 0 && summary.unplanned === 0,
    behavioralCompletion: 'not-evaluated',
    summary,
    findings,
  };
}
