import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function copyClone(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const result = spawnSync('/bin/cp', ['-cR', source, target], { encoding: 'utf8' });
  if (result.status === 0) return;
  fs.cpSync(source, target, { recursive: true, dereference: false });
}

export function extractCandidatePackage({ tarball, target, typeScriptHostSource }) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  const result = spawnSync('tar', ['-xzf', tarball, '-C', target, '--strip-components', '1'], {
    encoding: 'utf8',
  });
  if (result.status !== 0 || result.error) {
    throw new Error(`candidate extraction failed: ${result.stderr || result.stdout || result.error}`);
  }
  const dependency = path.join(target, 'node_modules', 'typescript-ark-host');
  copyClone(typeScriptHostSource, dependency);
  return target;
}
