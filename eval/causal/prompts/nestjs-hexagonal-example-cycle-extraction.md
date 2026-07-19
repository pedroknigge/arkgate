Implement the following focused change in this pinned TypeScript repository:

Remove the circular dependency between calculate-priority and priority-discount by extracting the pure pricing policy to the domain layer. Preserve calculatePriority(amount, tier): standard returns amount + 5; preferred returns amount * 0.9.

Work only inside z08-task/nestjs-hexagonal-example-cycle-extraction.
Do not edit package metadata, tests, TypeScript configuration, architecture configuration, agent instructions, or CI.
Preserve the existing public behavior and exports unless the requirement below names the replacement API.
Finish with production code; do not add test-only branches or weaken checks.
