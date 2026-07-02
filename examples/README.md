# Ark Examples

## basic/

Runnable demo that exercises multiple core features together:

- Intents
- Event Bus + attached policy enforcement
- Dependency Graph (Mermaid + edges)
- Metadata registry

To run (tsx recommended; examples are not emitted by the build):

```bash
npx tsx examples/basic/index.ts
```

## publish-smoke/

Smoke / verification script exercising the main public surface with rich multi-line output (for automated or manual verification of behavior).

Uses `createArkKernel`, `defineIntent`, policy enforcement, `createDependencyGraph`, metadata, ports/adapters (`definePort`/`createAdapter`/`checkContract`), `createSaga`, and prints:

- received events
- bus history (JSON)
- graph mermaid
- metadata count
- adapter contract result
- kernel profile name

To run (tsx recommended):

```bash
npx tsx examples/publish-smoke/consumer.ts
```

It will print a `=== PUBLISH SMOKE OUTPUT ===` block and exit cleanly on success.
