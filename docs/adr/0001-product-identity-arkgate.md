# ADR 0001: Retain ArkGate as the product identity

- **Status:** Accepted
- **Date:** 2026-07-11
- **Owner:** Pedro Knigge (`pedroknigge`)
- **Decision scope:** product, package, commands, configuration, MCP, skills, repository, and website

## Context

Before Phase C stabilizes new public contracts, the product needs one durable identity. ArkGate
already owns an installed package, repository history, release provenance, documentation, command
surface, configuration filename, MCP namespace, skills, and a live website. A separate project uses
the similar name Archgate in the same broad developer-tooling category, so retaining ArkGate needs
an explicit positioning boundary.

An unpublished local rename experiment demonstrated the migration cost: it touched the npm package,
six commands, four import entry points, the config filename, environment variables, MCP resources
and tools, host templates, skills, examples, evaluation fixtures, repository metadata, and website
planning. Maintaining both identities for a compatibility major would add a second package and a
large alias/removal surface without improving ArkGate's architecture-enforcement behavior.

## Options considered

| Option | Benefit | Cost / risk |
|---|---|---|
| Retain ArkGate | Preserves the installed base, release history, package, repository, domain, commands, and config contract | Requires clear differentiation from the unrelated Archgate CLI |
| Rename before Phase C | Reduces name similarity before new APIs stabilize | Splits identity across every public surface and requires a compatibility major, redirects, reservations, and user migration |

## Decision

Retain **ArkGate**. The canonical public identity is:

| Surface | Canonical value |
|---|---|
| Product | ArkGate — Architecture Co-pilot for AI TypeScript |
| npm | [`arkgate`](https://www.npmjs.com/package/arkgate) |
| Repository | [`pedroknigge/arkgate`](https://github.com/pedroknigge/arkgate) |
| Website | [`arkgate.online`](https://www.arkgate.online/) |
| Commands | `arkgate`, `arkgate-check`, `arkgate-mcp`; short aliases `ark`, `ark-check`, `ark-mcp` |
| Configuration | `ark.config.json` |
| Environment | `ARK_*` |
| MCP | `io.github.pedroknigge/arkgate`, `ark://...`, and `ark_*` tools |
| Skills | `/ark-*` |
| Public code | Existing `Ark*` types and values |

The product description must identify ArkGate as TypeScript architecture enforcement for AI-assisted
development. It must not imply affiliation with the separate
[`archgate/cli`](https://github.com/archgate/cli) project. This ADR records a product decision, not
trademark clearance or legal advice.

## Consequences

- S07 is complete and C01 may stabilize `ark.config.json` and the existing ArkGate API vocabulary.
- No compatibility package, duplicate commands, alternate configuration filename, redirects, or
  public cutover are required.
- The local rename experiment is reversed through normal Git history; earlier runtime, scanner,
  enforcement, and support-matrix work remains intact.
- A future rename requires a new ADR with an explicit migration plan. It cannot be introduced as an
  incidental Phase C refactor.

## Verification

- Package evidence: <https://www.npmjs.com/package/arkgate>
- Repository evidence: <https://github.com/pedroknigge/arkgate>
- Website evidence: <https://www.arkgate.online/>
- Repository package metadata, bins, config, MCP, templates, docs, and examples use the canonical
  table above.
