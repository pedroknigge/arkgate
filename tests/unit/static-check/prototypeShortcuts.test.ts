/**
 * Soft prototype-shortcut residual. Silent unless Persistence / Domain (or an
 * auth tag) is declared and a SQLite / JSON-file store or admin literal sits
 * outside that house. Never a gate fail.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PROTOTYPE_ADMIN_ASK,
  PROTOTYPE_ADMIN_NEXT,
  PROTOTYPE_JSON_ASK,
  PROTOTYPE_KIND,
  PROTOTYPE_PACK_ASK,
  PROTOTYPE_PACK_NEXT,
  PROTOTYPE_PERSISTENCE_NEXT,
  PROTOTYPE_SQLITE_ASK,
  collectPrototypeShortcutsResidual,
  isPersistenceRoleLayerName,
} from '../../../bin/lib/prototype-shortcuts.mjs';
import { runDoctor } from '../../../bin/lib/doctor-plan.mjs';

const temps: string[] = [];

function mk(prefix = 'ark-proto-'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(root);
  return root;
}

afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function writeFile(root: string, rel: string, body: string) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body);
}

function appConfig(extra: Record<string, unknown> = {}) {
  return {
    include: ['src'],
    layers: [
      { name: 'DomainModel', patterns: ['src/domain/**'] },
      { name: 'Application', patterns: ['src/lib/**'] },
      { name: 'PersistenceAdapters', patterns: ['src/adapters/**'] },
      { name: 'PresentationAdapters', patterns: ['src/pages/**'] },
    ],
    rules: [],
    ...extra,
  };
}

function noPersistConfig() {
  return {
    include: ['src'],
    layers: [
      { name: 'DomainModel', patterns: ['src/domain/**'] },
      { name: 'PresentationAdapters', patterns: ['src/pages/**'] },
    ],
    rules: [],
  };
}

function collectFromTree(root: string, config: ReturnType<typeof appConfig>, rels: string[]) {
  return collectPrototypeShortcutsResidual({
    root,
    config,
    files: rels.map((rel) => path.join(root, rel)),
  });
}

describe('prototype shortcut helper', () => {
  it('names Persistence-role houses and stays quiet without a declared home or marker', () => {
    expect(isPersistenceRoleLayerName('PersistenceAdapters')).toBe(true);
    expect(isPersistenceRoleLayerName('UserRepository')).toBe(true);
    expect(isPersistenceRoleLayerName('DomainModel')).toBe(false);
    expect(collectPrototypeShortcutsResidual({})).toBeNull();

    const noHome = mk('ark-proto-nohome-');
    writeFile(noHome, 'src/lib/db.ts', "import Database from 'better-sqlite3';\nexport const db = new Database('app.db');\n");
    expect(
      collectFromTree(
        noHome,
        { include: ['src'], layers: [{ name: 'Application', patterns: ['src/**'] }], rules: [] },
        ['src/lib/db.ts']
      )
    ).toBeNull();

    const quiet = mk('ark-proto-quiet-');
    writeFile(quiet, 'src/pages/home.ts', 'export const Home = () => null;\n');
    expect(collectFromTree(quiet, appConfig(), ['src/pages/home.ts'])).toBeNull();
  });

  it('fires sqlite and json-file when the store sits outside Persistence, and stays quiet when it is home', () => {
    const sqlite = mk('ark-proto-sqlite-');
    writeFile(
      sqlite,
      'src/lib/db.ts',
      "import Database from 'better-sqlite3';\nexport const db = new Database('app.db');\n"
    );
    const sqliteHit = collectFromTree(sqlite, appConfig(), ['src/lib/db.ts']);
    expect(sqliteHit?.kinds).toEqual([PROTOTYPE_KIND.SQLITE]);
    expect(sqliteHit?.ask).toBe(PROTOTYPE_SQLITE_ASK);
    expect(sqliteHit?.nextAction).toBe(PROTOTYPE_PERSISTENCE_NEXT);
    expect(sqliteHit?.ask).not.toMatch(/Haken|ξ|xiHash/i);
    expect(sqliteHit?.evidence).toContain('src/lib/db.ts');

    const json = mk('ark-proto-json-');
    writeFile(
      json,
      'src/lib/store.ts',
      "import { readFileSync, writeFileSync } from 'node:fs';\nexport const load = () => JSON.parse(readFileSync('data/db.json', 'utf8'));\nexport const save = (v) => writeFileSync('data/db.json', JSON.stringify(v));\n"
    );
    const jsonHit = collectFromTree(json, appConfig(), ['src/lib/store.ts']);
    expect(jsonHit?.kinds).toEqual([PROTOTYPE_KIND.JSON_FILE]);
    expect(jsonHit?.ask).toBe(PROTOTYPE_JSON_ASK);
    expect(jsonHit?.nextAction).toBe(PROTOTYPE_PERSISTENCE_NEXT);

    const configRead = mk('ark-proto-pkg-');
    writeFile(configRead, 'src/lib/read.ts', "import { readFileSync } from 'node:fs';\nexport const pkg = JSON.parse(readFileSync('package.json', 'utf8'));\n");
    expect(collectFromTree(configRead, appConfig(), ['src/lib/read.ts'])).toBeNull();

    const home = mk('ark-proto-home-');
    writeFile(
      home,
      'src/adapters/sqlite.ts',
      "import Database from 'better-sqlite3';\nexport const db = new Database('app.db');\n"
    );
    expect(collectFromTree(home, appConfig(), ['src/adapters/sqlite.ts'])).toBeNull();
  });

  it('fires admin literals outside Domain, and stays quiet in Domain or on an auth tag', () => {
    const page = mk('ark-proto-admin-');
    writeFile(page, 'src/pages/home.ts', "export const canEnter = (role: string) => role === 'admin';\n");
    const adminHit = collectFromTree(page, appConfig(), ['src/pages/home.ts']);
    expect(adminHit?.kinds).toEqual([PROTOTYPE_KIND.ADMIN]);
    expect(adminHit?.ask).toBe(PROTOTYPE_ADMIN_ASK);
    expect(adminHit?.nextAction).toBe(PROTOTYPE_ADMIN_NEXT);

    const domain = mk('ark-proto-dom-');
    writeFile(domain, 'src/domain/policy.ts', "export const ADMIN_ROLE = 'admin';\nexport const isAdminRole = (role: string) => role === ADMIN_ROLE;\n");
    expect(collectFromTree(domain, appConfig(), ['src/domain/policy.ts'])).toBeNull();

    const tagged = mk('ark-proto-tag-');
    writeFile(tagged, 'src/pages/gate.ts', "export const godMode = true;\n");
    const authConfig = appConfig();
    authConfig.layers = authConfig.layers.map((layer) =>
      layer.name === 'PresentationAdapters' ? { ...layer, trustBoundary: 'admin' } : layer
    );
    expect(collectFromTree(tagged, authConfig, ['src/pages/gate.ts'])).toBeNull();

    expect(collectFromTree(page, noPersistConfig(), ['src/pages/home.ts'])?.kinds).toEqual([
      PROTOTYPE_KIND.ADMIN,
    ]);
  });

  it('composes the pack when a file store and an admin literal both fire', () => {
    const mixed = mk('ark-proto-mix-');
    writeFile(mixed, 'src/lib/db.ts', "import Database from 'better-sqlite3';\nexport const db = new Database('app.db');\n");
    writeFile(mixed, 'src/pages/home.ts', "export const isAdmin = true;\n");
    const pack = collectFromTree(mixed, appConfig(), ['src/lib/db.ts', 'src/pages/home.ts']);
    expect(pack?.kinds).toEqual([PROTOTYPE_KIND.SQLITE, PROTOTYPE_KIND.ADMIN]);
    expect(pack?.ask).toBe(PROTOTYPE_PACK_ASK);
    expect(pack?.nextAction).toBe(PROTOTYPE_PACK_NEXT);
  });
});

describe('doctor residual', () => {
  it('omits prototypeShortcuts unless a declared house still has a prototype standing in', () => {
    const quiet = mk('ark-proto-doc-q-');
    writeFile(quiet, 'src/domain/value.ts', 'export const value = 1;\n');
    writeFile(quiet, 'src/adapters/memory.ts', 'export const store = new Map();\n');
    fs.writeFileSync(path.join(quiet, 'ark.config.json'), JSON.stringify(appConfig()));
    const quietFiles = [
      path.join(quiet, 'src/domain/value.ts'),
      path.join(quiet, 'src/adapters/memory.ts'),
    ];
    let silent: { doctor?: { prototypeShortcuts?: { kinds?: string[] }; ok?: boolean }; ok?: boolean } | undefined;
    runDoctor(quiet, appConfig(), quietFiles, [], [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        silent = JSON.parse(text);
      },
    });
    expect(silent?.doctor?.prototypeShortcuts).toBeUndefined();
    expect(silent?.ok).toBe(true);

    const fire = mk('ark-proto-doc-f-');
    writeFile(
      fire,
      'src/lib/db.ts',
      "import Database from 'better-sqlite3';\nexport const db = new Database('app.db');\n"
    );
    fs.mkdirSync(path.join(fire, 'src/adapters'), { recursive: true });
    fs.writeFileSync(path.join(fire, 'ark.config.json'), JSON.stringify(appConfig()));
    const fireFiles = [path.join(fire, 'src/lib/db.ts')];
    let fired: { doctor?: { prototypeShortcuts?: { kinds?: string[]; nextAction?: string } }; ok?: boolean } | undefined;
    runDoctor(fire, appConfig(), fireFiles, [], [], true, {
      completeness: 'complete',
      writeJson: (text: string) => {
        fired = JSON.parse(text);
      },
    });
    expect(fired?.ok).toBe(true);
    expect(fired?.doctor?.prototypeShortcuts?.kinds).toEqual([PROTOTYPE_KIND.SQLITE]);
    expect(fired?.doctor?.prototypeShortcuts?.nextAction).toContain('/ark-place');
  });
});

describe('live doctor CLI', () => {
  it('prints the next step when a prototype store is standing in, and stays quiet otherwise', () => {
    const missing = mk('ark-proto-cli-m-');
    writeFile(
      missing,
      'src/lib/db.ts',
      "import Database from 'better-sqlite3';\nexport const db = new Database('app.db');\n"
    );
    fs.mkdirSync(path.join(missing, 'src/adapters'), { recursive: true });
    fs.writeFileSync(path.join(missing, 'ark.config.json'), JSON.stringify(appConfig()));
    const missingOut = execFileSync(
      process.execPath,
      [path.resolve('bin/ark-check.mjs'), '--root', missing, '--doctor'],
      { encoding: 'utf8' }
    );
    expect(missingOut).toContain(PROTOTYPE_SQLITE_ASK);
    expect(missingOut).toContain('/ark-place');
    expect(missingOut).not.toMatch(/Haken|ξ/);

    const quiet = mk('ark-proto-cli-q-');
    writeFile(quiet, 'src/adapters/sqlite.ts', "import Database from 'better-sqlite3';\nexport const db = new Database('app.db');\n");
    fs.writeFileSync(path.join(quiet, 'ark.config.json'), JSON.stringify(appConfig()));
    const quietOut = execFileSync(
      process.execPath,
      [path.resolve('bin/ark-check.mjs'), '--root', quiet, '--doctor'],
      { encoding: 'utf8' }
    );
    expect(quietOut).not.toContain(PROTOTYPE_SQLITE_ASK);
  });

  it('does not fail a green check when the residual fires', () => {
    const tree = mk('ark-proto-cli-g-');
    writeFile(
      tree,
      'src/lib/db.ts',
      "import Database from 'better-sqlite3';\nexport const db = new Database('app.db');\n"
    );
    fs.mkdirSync(path.join(tree, 'src/adapters'), { recursive: true });
    fs.writeFileSync(path.join(tree, 'ark.config.json'), JSON.stringify(appConfig()));
    const out = execFileSync(
      process.execPath,
      [path.resolve('bin/ark-check.mjs'), '--root', tree],
      { encoding: 'utf8' }
    );
    expect(out).toMatch(/Ark check passed/);
    expect(out).not.toMatch(/Ark check failed/);
  });
});
