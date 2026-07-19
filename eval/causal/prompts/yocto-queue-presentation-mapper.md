Implement the following focused change in this pinned TypeScript repository:

Remove the domain model's HTTP response dependency. QueueView must expose snapshot(), and QueueViewPresenter.toResponse(snapshot) must produce { id, displayLabel } with a trimmed label.

Work only inside z08-task/yocto-queue-presentation-mapper.
Do not edit package metadata, tests, TypeScript configuration, architecture configuration, agent instructions, or CI.
Preserve the existing public behavior and exports unless the requirement below names the replacement API.
Finish with production code; do not add test-only branches or weaken checks.
