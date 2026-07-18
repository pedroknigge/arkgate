# Demo: write-gate self-correction

Reproduce how an agent sees a layer violation, gets a plain-language fix hint, and
corrects the architecture instead of weakening the contract.

## Prerequisites

- Ark installed in the repo (`ark-check`, agent gates optional for this demo)
- [examples/hexagonal-order-api](https://github.com/pedroknigge/arkgate/tree/main/examples/hexagonal-order-api) cloned with dependencies

## Steps

### 1. Confirm the project is green

```bash
cd examples/hexagonal-order-api
npm install
npm run check
```

Expected:

```
✔ Ark check passed.
```

### 2. Introduce a deliberate domain → persistence import

Add to the top of `src/domain/order.ts`:

```ts
import { createInMemoryOrderRepository } from '../adapters/persistence/in-memory-order-repository.js';
```

### 3. Run the CI gate (same architecture contract as the write-gate hook)

```bash
npm run check
```

Expected violation (abbreviated):

```
✖ LAYER_IMPORT_VIOLATION  src/domain/order.ts
  DomainModel → PersistenceAdapters
  DomainModel must not import PersistenceAdapters.
```

With `--json`, the same violation includes `fixClass: port-inversion` and an
`enthusiastHint` describing the port pattern.

### 4. Self-correct (architecture fix, not a config edit)

Revert the bad import. Define or use the existing `OrderRepository` port in domain and
keep the in-memory implementation in `src/adapters/persistence/`.

```bash
npm run check
```

Expected:

```
✔ Ark check passed.
```

## What this proves

- The gate blocks the common enthusiast mistake (database code in domain).
- The error message points at the **layer edge**, not a generic lint rule.
- The fix is a file move or port inversion — not editing `ark.config.json`.

See also: [Break it on purpose](https://github.com/pedroknigge/arkgate/blob/main/examples/hexagonal-order-api/README.md#break-it-on-purpose)
for two more exercises.
