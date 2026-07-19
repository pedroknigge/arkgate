Implement the following focused change in this pinned TypeScript repository:

Refactor LeaseStatus so its constructor accepts a replaceable Clock with now(): Date. Expiration must be true at the exact deadline. Keep SystemClock as the production adapter, and remove the application layer's dependency on concrete infrastructure.

Work only inside z08-task/yocto-queue-clock-boundary.
Do not edit package metadata, tests, TypeScript configuration, architecture configuration, agent instructions, or CI.
Preserve the existing public behavior and exports unless the requirement below names the replacement API.
Finish with production code; do not add test-only branches or weaken checks.
