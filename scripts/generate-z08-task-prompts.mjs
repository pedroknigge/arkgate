import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { taskPrompt } from '../eval/causal/task-materialize.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(repo, 'eval/causal/task-catalog.v1.json');
const promptsRoot = path.join(repo, 'eval/causal/prompts');
const check = process.argv.includes('--check');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const tasks = catalog.repositories.flatMap((repository) =>
  catalog.scenarios.map((scenario, index) => ({
    id: `${repository.id}-${scenario}`,
    repositoryId: repository.id,
    scenario,
    noun: repository.nouns[index],
  }))
);

const expected = new Map(tasks.map((task) => [`${task.id}.md`, `${taskPrompt(task)}\n`]));
if (check) {
  const actual = fs.existsSync(promptsRoot)
    ? fs.readdirSync(promptsRoot).filter((name) => name.endsWith('.md')).sort()
    : [];
  const expectedNames = [...expected.keys()].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expectedNames)) {
    throw new Error('Z08 prompt file set drifted; run npm run generate:z08-prompts');
  }
  for (const [name, prompt] of expected) {
    if (fs.readFileSync(path.join(promptsRoot, name), 'utf8') !== prompt) {
      throw new Error(`${name} drifted; run npm run generate:z08-prompts`);
    }
  }
} else {
  fs.mkdirSync(promptsRoot, { recursive: true });
  for (const [name, prompt] of expected) {
    fs.writeFileSync(path.join(promptsRoot, name), prompt);
  }
}

const digest = createHash('sha256')
  .update(tasks.map((task) => `${task.id}\0${taskPrompt(task)}\0`).join(''))
  .digest('hex');
console.log(`${check ? 'Verified' : 'Generated'} ${tasks.length} Z08 prompts (${digest}).`);
