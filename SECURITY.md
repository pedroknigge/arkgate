# Security Policy

Ark runs in developer machines, CI, and agent tooling paths, so security reports are
treated as high priority.

## Supported Versions

Security fixes target the latest published minor version. If a fix needs a new release,
the changelog will call out the affected versions and the patched version.

## Reporting A Vulnerability

Please do not open a public issue for a suspected vulnerability.

Preferred path: use GitHub's private vulnerability reporting for this repository. Include:

- affected version or commit
- reproduction steps
- expected impact
- whether the issue affects `ark-check`, `ark-mcp`, generated agent gates, the GitHub
  Action, or the optional runtime kernel

If private vulnerability reporting is unavailable, open a minimal public issue asking for
a private security contact without including exploit details.

## Release Verification

The roadmap tracks stronger release verification, including npm provenance, signed tags,
and published checksums. Until those are in place, consumers should pin exact package
versions or GitHub Action SHAs in sensitive environments.
