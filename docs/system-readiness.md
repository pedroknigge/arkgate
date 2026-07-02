# Ark System Readiness Assessment

> **v1.0.0 Release-time Snapshot / Assessment** (2026-07-01). System readiness view at v1.0.0 release.

**Date:** 2026-07-01
**Version:** 1.0.0
**Package:** `ark-runtime-kernel`

> v1.0 note: `createArkKernel()` now uses the hardened runtime defaults. Strict event
> contracts, known-source enforcement, and hard observed producer→event layer-flow
> enforcement are enabled unless explicitly relaxed. `ark-check` also reports
> configuration coverage warnings so teams can see when files or rules sit outside static
> governance.

Ark is ready to use as an in-process architectural governance kernel when teams deliberately route important interactions through its strict kernel, registry, event bus, event contracts, interceptors, policies, graph, audit trail, workflow engine, projection registry, metadata system, outbox, static checks, ESLint rules, test harness, observability reports, and manifest. It is not a replacement for durable infrastructure, source-authenticity controls, type-aware semantic analysis, external compliance tooling, databases, or distributed queues.

## 1. Simple PYME / SMB Systems

**Readiness level:** Conditionally Ready

Ark can be useful in small systems when architecture is expected to grow, but it is easy to over-install governance too early. For a simple internal tool or small e-commerce app, the overhead of naming every intent and wiring policies may cost more than it saves.

**Main risks**

- More structure than the team needs for low-complexity CRUD work.
- Small teams may bypass Ark under delivery pressure, reducing its value.
- The event bus and policy model may feel heavy if the system has few meaningful boundaries.

**When it makes sense**

- The app is expected to grow into multiple modules or bounded contexts.
- AI agents are generating or modifying production code.
- The team wants a lightweight contract around domain events and architectural naming.

**Recommended approach**

Use only the Intent Registry, Event Bus, EventContractRegistry, AuditTrail, `ark-check`, the ESLint plugin, and a small number of hard policies. Avoid projections/workflows until the system has real event-driven complexity.

## 2. Growing / Mid-size Systems

**Readiness level:** Ready

This is Ark's strongest current fit. Mid-size systems have enough architectural entropy risk to justify runtime governance, but not so much distributed complexity that Ark's in-process scope becomes a limitation.

**Main risks**

- Governance remains partial unless teams standardize registry and event-bus wiring.
- Policies need ownership; stale policies can become noise.
- Direct module calls can still bypass runtime checks unless boundary conventions are enforced with `ark-check`, code review, or a stronger project-specific analyzer.

**When it makes sense**

- Multiple developers or teams are touching shared modules.
- Domain events, integrations, and workflows are becoming harder to reason about.
- Agents are contributing code and need a manifest plus validation surface.

**Recommended approach**

Use `createStrictArkKernel()` as the core architectural kernel for event naming, source validation, event contracts, add-only interceptors, publish/subscribe validation, hard policies, audit, graph sync, observability drift reports, projections, workflow snapshots, outbox records, and manifest export. Add `ark-check` and `ark-runtime-kernel/eslint` in CI, then add `AIGateExtension` analyzers where the project needs deeper semantic checks.

## 3. Complex OMS

**Readiness level:** Ready for in-process workflows, Conditionally Ready for distributed OMS

Ark is valuable for an OMS as a governance layer and can now run in-process workflows with snapshots, retries, timeouts, compensation, audit, event contracts, interceptors, outbox handoff, drift reporting, and pluggable stores. Distributed order orchestration, inventory reservations across services, replay at scale, and exception operations still need dedicated production infrastructure.

**Main risks**

- The included workflow engine is in-process; durability depends on the configured `WorkflowStore`.
- OMS flows often need replay, distributed locks, queue backpressure, and operational dashboards outside Ark's scope.
- Runtime enforcement only covers interactions routed through Ark; `ark-check` and the ESLint plugin cover configured file imports, intent strings, and common publish bypasses, not all semantic coupling.

**When it makes sense**

- Ark governs intent names, event publication, layer boundaries, and agent-facing manifests.
- Ark handles bounded-context workflows; a separate platform handles distributed order lifecycle execution when needed.
- The team needs clear contracts across sales channels, inventory, fulfillment, and exception modules.

**Recommended approach**

Use Ark as the bounded-context workflow and governance kernel. Pair it with queue, persistence, outbox delivery, and operational systems when workflows cross process or service boundaries.

## 4. CRM Systems

**Readiness level:** Ready for Modular CRMs, Conditionally Ready for Enterprise CRMs

Ark fits CRM systems with growing integrations and automation because intent naming, event contracts, interceptors, metadata, manifests, policy hooks, audit records, workflows, outbox handoff, drift reporting, and projections help keep customer workflows explicit. Enterprise-grade permissioning and data consistency still require dedicated layers.

**Main risks**

- Ark provides audit contracts and in-memory audit storage, but durable audit storage is supplied through `AuditStore`.
- Policies can validate architectural behavior, not business correctness by themselves.
- CRM automation flows can outgrow in-process workflow execution when they require distributed queues or operational dashboards.

**When it makes sense**

- The CRM has multiple integration channels or automation modules.
- Agents generate workflow, integration, or domain-event code.
- The team wants machine-readable contracts for entities, intents, and relationships.

**Recommended approach**

Use Ark for intent governance, event bus validation, event contracts, metadata export, audit history, workflow snapshots, projections, `ark-check`, ESLint checks, test harness snapshots, and AI gate checks. Pair it with existing auth, durable storage, and job orchestration systems.

## 5. Enterprise ERP / Large Platforms

**Readiness level:** Conditionally Ready as a Kernel, Not Recommended as the Sole Governance System

Ark can provide clear value as an embedded governance kernel inside bounded contexts, but enterprise platforms need broader controls: type-aware static analysis, CI policy ownership, distributed tracing, compliance audit trails, schema governance, and operational ownership.

**Main risks**

- Ark is in-process; it does not enforce boundaries across services by itself.
- Large platforms need policy lifecycle management and compliance evidence beyond runtime traces and manifest exports.
- Teams can bypass Ark unless platform standards require it.
- Enterprise workflows need distributed orchestration beyond Ark's in-process workflow engine.

**When it makes sense**

- Each bounded context adopts Ark as a local runtime contract layer.
- CI and platform tooling consume Ark manifests and run `ark-check`.
- External analyzers enforce type-aware dependencies, service boundaries, and cross-repo rules.
- Governance teams own policy definitions and versioning.

**Recommended approach**

Use Ark as one part of a larger architecture governance program. Do not rely on it alone for enterprise compliance or cross-service isolation.

## Overall Recommendation

Ark provides clear value today for growing and mid-size systems, modular CRMs, and bounded contexts inside larger platforms. It is most useful where event-driven architecture, AI-generated code, or multi-module growth makes architectural drift expensive.

Ark is too narrow as the sole governance mechanism for enterprise ERP compliance or highly distributed platforms. In those environments, use it as a local runtime kernel and pair it with distributed workflow engines, persistence, stronger CI analyzers, audit storage, and platform standards.
