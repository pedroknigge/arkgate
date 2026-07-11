# worker-pipeline-starter

**Archetype:** `worker-pipeline` — background processing with no direct user UI.

**Analogy:** A night shift — timers and queues wake up, run coordinated steps, and write results through adapters.

Phase-1 scaffold only. Launch is **N/A** until you connect a real queue or cron runner.

## Layout

```
src/
  application/    ApplicationOrchestration — reusable job steps and ports
  adapters/       PersistenceAdapters — database, queue, file store
  jobs/           BackgroundJobsScheduling — cron files and queue consumers
```

## Phase 1 layers

| Layer | Put here when you build… |
|-------|--------------------------|
| ApplicationOrchestration | Shared steps (process outbox, send digest, …) |
| PersistenceAdapters | Job state, outbox tables, external APIs |
| BackgroundJobsScheduling | `cron.ts`, queue `consumer.ts`, scheduler wiring |

## Three rules for your AI agent

1. **Job files call application use cases — not SQL clients directly.**
2. **Keep schedulers thin.** Heavy logic belongs in `application/`.
3. **Do not weaken `structrail.config.json` to pass.** Relocate imports instead.

## Verify

```bash
npm install
npm run check
```

## Next steps

```bash
structrail init --archetype worker-pipeline --yes
structrail-check --doctor
```