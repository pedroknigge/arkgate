#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = ['design-delta', 'enforcement-state', 'hook-templates'];
const check = process.argv.includes('--check');

for (const name of artifacts) {
  const sourcePath = path.join(root, `bin/lib/${name}.source.mjs`);
  const outputPath = path.join(root, `bin/lib/${name}.mjs`);
  const transformed = await transform(fs.readFileSync(sourcePath, 'utf8'), {
    loader: 'js',
    format: 'esm',
    minify: true,
    target: 'node18',
    legalComments: 'none',
  });
  const generated = `// Generated from ${name}.source.mjs — run npm run generate:packaged-tooling.\n${transformed.code}`;
  if (!check) {
    fs.writeFileSync(outputPath, generated);
    console.log(`Generated bin/lib/${name}.mjs.`);
    continue;
  }
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== generated) {
    console.error(`✖ bin/lib/${name}.mjs is stale. Run npm run generate:packaged-tooling.`);
    process.exitCode = 1;
  } else {
    console.log(`✔ bin/lib/${name}.mjs is up to date.`);
  }
}

const schemaSource = path.join(root, 'schemas/ark.design-delta.schema.source.json');
const schemaOutput = path.join(root, 'schemas/ark.design-delta.schema.json');
const schema = `${JSON.stringify(JSON.parse(fs.readFileSync(schemaSource, 'utf8')))}\n`;
if (!check) {
  fs.writeFileSync(schemaOutput, schema);
  console.log('Generated schemas/ark.design-delta.schema.json.');
} else if (!fs.existsSync(schemaOutput) || fs.readFileSync(schemaOutput, 'utf8') !== schema) {
  console.error('✖ schemas/ark.design-delta.schema.json is stale. Run npm run generate:packaged-tooling.');
  process.exitCode = 1;
} else {
  console.log('✔ schemas/ark.design-delta.schema.json is up to date.');
}
