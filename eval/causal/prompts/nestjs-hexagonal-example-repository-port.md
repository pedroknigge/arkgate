Implement the following focused change in this pinned TypeScript repository:

Refactor FindQueueItem so its constructor accepts a QueueItemRepository port and execute(id) remains asynchronous. Keep JsonQueueItemRepository as an adapter, but remove all application-layer imports of concrete infrastructure.

Work only inside z08-task/nestjs-hexagonal-example-repository-port.
Do not edit package metadata, tests, TypeScript configuration, architecture configuration, agent instructions, or CI.
Preserve the existing public behavior and exports unless the requirement below names the replacement API.
Finish with production code; do not add test-only branches or weaken checks.
