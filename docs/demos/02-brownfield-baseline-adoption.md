# Demo: brownfield baseline adoption

Walk through honest adoption on an existing repo: diagnose, classify, freeze real debt,
burn down in order. This demo uses the eval fixture `enthusiast-wrong-layer` as a
stand-in brownfield tree.

Full playbook: [docs/brownfield-adoption.md](../brownfield-adoption.md).

## Prerequisites

- Ark built or installed from this repository

## Steps

### 1. Copy the brownfield fixture to a temp directory

```bash
TMP=$(mktemp -d)
cp -R eval/cases/enthusiast-wrong-layer/* "$TMP/"
cd "$TMP"
```

### 2. Diagnose — read the violation summary

```bash
node /path/to/ark/bin/ark-check.mjs --root . --config ark.config.json --json
```

Expected: `LAYER_IMPORT_VIOLATION` from domain importing `src/infra/db.ts`.

### 3. Classify — coverage and doctor

```bash
node /path/to/ark/bin/ark-check.mjs --root . --doctor
node /path/to/ark/bin/ark-check.mjs --root . --coverage
```

Note `governed.percent` and any ungoverned directories. Do **not** regenerate
`ark.config.json` unasked on a real brownfield repo.

### 4. Fix architecture (not the gate)

Move persistence behind a port in domain; relocate `db.ts` under
`src/adapters/persistence/` (or invert via a repository interface). Re-run:

```bash
node /path/to/ark/bin/ark-check.mjs --root . --config ark.config.json --strict-config
```

Expected after a real fix:

```
✔ Ark check passed.
```

### 5. Baseline only genuine remaining debt

If violations are widespread but **concentrated on one false edge**, fix the contract
first (see playbook §3). When the remainder is real legacy debt:

```bash
node /path/to/ark/bin/ark-check.mjs --root . --update-baseline
```

New files must still pass without suppression.

## What this proves

- Brownfield adoption starts with truthful diagnosis, not a green check at any cost.
- `/ark-adopt` and `/ark-contract` align messy trees to the canonical profile.
- Baselines ratchet down; they do not replace architecture fixes.