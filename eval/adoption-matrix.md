# External adoption matrix (V03)

`eval/adoption/manifest.v1.json` pins twelve distinct public TypeScript repositories to full
commit SHAs. It balances the four product shapes, four supported hosts, npm/pnpm/yarn, and three
tree-size classes. Third-party source is always cloned into a temporary directory and is never
committed here.

## Reproduce

```bash
npm run build
npm run eval:adoption -- --manifest eval/adoption/manifest.v1.json
```

The runner packs the current candidate once, installs that tarball into an isolated harness, then
runs each clean clone through `ark start --apply` and `ark-check --strict-merge`. It records the
pinned repository SHA, tarball SHA-256, host, package-manager command, preview/apply sizes,
governed coverage, candidate-install time, first-green time excluding that install, issues, and
merge-gate state.

Results live under `eval/adoption/results/<candidate-sha>/`; only JSON evidence and the summary
Markdown are committed. The scheduled/manual workflow uploads the same evidence and normal PR CI
never depends on third-party network access.
