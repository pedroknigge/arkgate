# Z08 causal evidence v1

This directory is the compact, reviewable evidence for the preregistered Z08 experiment completed
on 2026-07-20. The immutable manifest is
[`../../manifest.v1.json`](../../manifest.v1.json). Full per-cell transcripts, grader reports, and
the mutation report are in the
[`z08-causal-evidence-v1` release](https://github.com/pedroknigge/arkgate/releases/tag/z08-causal-evidence-v1).

## Result

- Denominator: 6 repositories, 24 tasks, 72 matched pairs, 144 cells.
- Primary estimand: treatment/control restricted mean time to first common green at the frozen
  240,000 ms cap.
- Result: 0.646526 ratio; hierarchical paired bootstrap 95% CI 0.457602–0.895450.
- Completion: control 34/72 (47.22%); treatment 55/72 (76.39%); delta +29.17 percentage points.
- Mutation: zero `NoCoverage` mutants across the four preregistered critical ranges.
- Acceptance: primary, completion, and overall gates passed without changing endpoints.

Four right-censored control cells ended without a provider usage payload. They remain in every
causal denominator, while token usage and cost are explicitly marked incomplete/partial rather
than zero. During execution, an automatic Grok binary update changed the digest before cell 97;
the runner failed closed before starting that cell. Execution resumed only after restoring the
exact preregistered 0.2.106 binary, so the evidence contains no mixed-binary cells.

## Files and identities

| File | SHA-256 | Purpose |
|------|---------|---------|
| [`report.json`](report.json) | `679c39b09125e7a0f84f8a39f2eaf1743a538cb5dd43c1870f3c094e08e0b959` | Final estimands, denominators, usage, completion, and mutation summary |
| [`ledger.jsonl`](ledger.jsonl) | `9dd8ec0f651c3191603bf3c7c26d93e97d3bd45bf7e75759f17e54d21cd96ec9` | Append-only terminal chain for all 144 cells plus mutation terminal |
| [`mutation-attestation.json`](mutation-attestation.json) | `7d96251ef65851f7e854d1d72e7fcf8799a206238a06845e5fc8d7c4af220ae8` | Exact candidate, mutation report, config, runner, and source identities |
| [`prequalification.json`](prequalification.json) | `3d367244196126d1dc6c2527aaaf1a6fa588d7cc2fb7ce41f33dd7d5ad5a1f19` | Six-repository/24-task source and grader prequalification |

The manifest's canonical JSON SHA-256 is
`ac3ef6c8f4981f3bf8117c568e818958aeedf898339fc6fe9cc11ccc8a3d72a2`. The exact candidate is source
`bbc3190bd502c98f14f63675061f590e028fc0ce`, packed as
[`arkgate-3.7.0.tgz`](https://github.com/pedroknigge/arkgate/releases/download/z08-causal-candidate-v2/arkgate-3.7.0.tgz)
with SHA-256 `59e8cbf9c3a3b3516fcb5ab78493adaf071a4d3e5afd6119854c340b99e70dc2`.
