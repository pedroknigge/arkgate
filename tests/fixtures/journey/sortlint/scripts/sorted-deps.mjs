import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const keys = Object.keys(pkg.devDependencies ?? {});
for (let index = 1; index < keys.length; index += 1) {
  if (keys[index - 1] > keys[index]) {
    console.error('devDependencies should be ordered alphabetically');
    process.exit(1);
  }
}
