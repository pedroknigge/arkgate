import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

export async function runStructrailBin(filename) {
  const packageJson = require.resolve('structrail/package.json');
  const target = path.join(path.dirname(packageJson), 'bin', filename);
  await import(pathToFileURL(target).href);
}
