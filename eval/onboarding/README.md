# O04 clean-room onboarding matrix

`npm run test:onboarding-matrix` builds a fresh temporary copy of each base fixture under
`tests/fixtures/onboarding`. It executes the ArkGate CLI, not a mocked planner, for all 144
shape/size/host/package-manager cells declared in `matrix.v1.json`.

The harness writes only a minimal package-manager lockfile signal per cell. It never invokes npm,
pnpm, yarn, Corepack, or any network operation. The generated package-manager command is inspected
from the read-only preview payload.

For every cell it proves that preview leaves the tree byte-identical, apply changes exactly the
previewed paths, strict merge succeeds, projected and measured governed coverage agree at at least
90%, the active host does not create unrelated-host files, and a second run is a zero diff. The
four canonical host capability profiles are additionally verified through the installed local gate:
Claude and Grok have hard write plus repair; Cursor and Codex expose advisory write plus the hard
CI merge gate, without borrowed hard-hook evidence.

The command is the evidence producer. Its candidate revision is the checkout `HEAD` at execution;
CI records that revision with the job that ran the matrix.
