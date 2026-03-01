# VirtualFS Regression Checklist

Baseline checklist for mandatory regression suites across all VirtualFS phases.

## Phase Suites

- Phase 0 (`m-2586`)
  - Contract docs present and synced: `plan-virtualfs.md`, `docs/dev/VIRTUALFS-CONTRACT.md`
  - Checklist maintained in this file

- Phase 1 (`m-a251`)
  - `services/fs/VirtualFS.core.test.ts`
  - Path-context integration coverage (`core/services/PathContextService.test.ts`)
  - Project-root detection coverage (VirtualFS-backed tests)

- Phase 2 (`m-978e`)
  - `services/fs/VirtualFS.lifecycle.test.ts`
  - Output/append integration coverage with shadow behavior and flush/apply/export

- Phase 3 (`m-0c26`)
  - `services/fs/VirtualFS.diff.test.ts`
  - Compatibility tests for `changes()` / `diff()` alias contract

- Phase 4 (`m-14ff`)
  - SDK export and execute integration tests for VirtualFS workflows
  - Interpreter virtual mode + directory-import integration tests
  - Public import-path smoke test for VirtualFS

- Phase 5 (`m-56a0`)
  - `tests/utils/MemoryFileSystem.parity.test.ts`
  - Fixture harness and high-impact suite parity checks

- Phase 6 (`m-78df`)
  - At least one SDK test mirroring published VirtualFS docs examples
  - Docs-derived fixtures rebuilt and green

- Phase 7 (`m-df9f`)
  - Stress/regression tests for many-file shadow sets
  - Repeated `flush`/`discard`/`reset` lifecycle cycles
  - Deep directory merge and mask behavior under load

## Full Regression Gate

Run this gate before closing each VirtualFS phase ticket:

1. `npm run build:fixtures`
2. `npm test`
3. `npm run test:tokens`
4. `npm run test:heredoc`
5. `npm run build`
