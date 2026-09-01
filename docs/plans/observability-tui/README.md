# Observability TUI Dashboard

**Status:** Plan
**Phase:** `OD` (Observability Dashboard)

## Purpose
ArkGate's kernel exposes deep architectural observability metrics (`ObservabilityDriftReport`) and clean interfaces for workflows, outboxes, and audit logs. However, currently these metrics are silent runtime data structures or purely internal diagnostics. 

The goal of this phase is to build an interactive Terminal User Interface (TUI) via a new CLI command (e.g., `ark dev` or `ark dashboard`). This dashboard will consume the clean ports exposed by the kernel and give the developer a production-grade monitoring experience "out of the box", without coupling the kernel itself to any presentation layer.

## Value Proposition (Enforcing by Visualizing)
As per the ArkGate philosophy, the user is free to choose their infrastructure. We do not build Postgres drivers in the kernel. But we **do** help enforce good practices. 
By providing a live TUI, we make it visually painful to go to production with toy defaults:
- If `InMemoryEventBuffer` is running in `NODE_ENV=production`, the dashboard flashes red.
- If architectural drift occurs (events emitted but not declared), the radar turns yellow.
- Stuck workflows or a failing outbox queue are immediately visible.

## Scope & Implementation Queue
- `OD01`: **TUI Foundation & CLI Entrypoint**. Define the command `ark dashboard` (or `ark dev`) in `bin/`. Choose a lightweight terminal UI approach (e.g., ANSI escape sequences, `blessed`, or a simple polling loop if we want to avoid heavy dependencies).
- `OD02`: **Hardening Status Panel**. Poll the kernel configuration to identify the active stores (Outbox, Audit, Workflow). Display visual warnings if memory stores are active in production environments.
- `OD03`: **Drift Radar**. Connect the dashboard to `ObservabilityReporter` to display real-time discrepancies between declared intents and observed EventBus traffic.
- `OD04`: **Queue & Workflow Monitor**. Display active/failed outbox records and in-flight saga states.

## Excluded (What we will NOT build)
- We will not couple `src/kernel/` to the terminal UI. The TUI lives exclusively in `bin/` or `src/cli/`.
- We will not build a web dashboard (HTML/React). This is strictly a developer CLI experience.
- We will not implement real DB stores to "fix" the warnings. The user must still write those adapters themselves.
