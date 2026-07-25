import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.resolve(root, process.argv[2] ?? 'reports/mutation/mutation.json');
const groupsPath = path.resolve(root, 'eval/mutation/critical-groups.v1.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const contract = JSON.parse(fs.readFileSync(groupsPath, 'utf8'));

function normalizedFile(file) {
  return file.split(path.sep).join('/').replace(/^\.\//, '');
}

function sourceEntries(files) {
  return Object.entries(files ?? {}).flatMap(([file, value]) =>
    (value.mutants ?? []).map((mutant) => ({ file: normalizedFile(file), mutant }))
  );
}

function inTarget(entry, target) {
  const line = entry.mutant.location?.start?.line;
  return (
    entry.file === target.file &&
    Number.isInteger(line) &&
    line >= target.startLine &&
    line <= target.endLine
  );
}

function score(entries) {
  const relevant = entries.filter((entry) => entry.mutant.status !== 'Ignored');
  const killed = relevant.filter((entry) => entry.mutant.status === 'Killed').length;
  const noCoverage = relevant.filter((entry) => entry.mutant.status === 'NoCoverage').length;
  return {
    killed,
    noCoverage,
    total: relevant.length,
    percent: relevant.length ? (killed / relevant.length) * 100 : 0,
  };
}

const entries = sourceEntries(report.files);
const requiredGroups = contract.groups.filter((group) => group.optional !== true);
const groupResults = contract.groups.map((group) => ({
  id: group.id,
  optional: group.optional === true,
  result: score(entries.filter((entry) => group.targets.some((target) => inTarget(entry, target)))),
}));
const aggregate = score(
  entries.filter((entry) =>
    requiredGroups.some((group) => group.targets.some((target) => inTarget(entry, target)))
  )
);
const failed = groupResults.filter(
  ({ optional, result }) =>
    !optional &&
    (result.total === 0 || result.noCoverage > 0 || result.percent < contract.threshold)
);

for (const { id, optional, result } of groupResults) {
  console.log(
    `${id}${optional ? ' (optional)' : ''}: ${result.percent.toFixed(2)}% (${result.killed}/${result.total}), ` +
    `NoCoverage=${result.noCoverage}`
  );
}
console.log(`aggregate: ${aggregate.percent.toFixed(2)}% (${aggregate.killed}/${aggregate.total})`);

if (aggregate.total === 0 || aggregate.percent < contract.threshold || failed.length > 0) {
  console.error(
    `Critical mutation groups must each meet ${contract.threshold}% with zero NoCoverage mutants.`
  );
  process.exit(1);
}
