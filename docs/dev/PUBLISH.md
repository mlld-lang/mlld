---
updated: 2026-02-25
tags: #ci, #release, #sdk
related-docs: docs/dev/SDK.md, docs/dev/BUILD-TEST.md, docs/dev/MLLDX.md
related-code: .github/workflows/publish.yml, scripts/sync-sdk-versions.cjs, scripts/publish-with-mlldx.cjs
---

# Publish Workflow

## tldr

- Runs on push to `main` or manual `workflow_dispatch` with target selection
- Parallel publish jobs: npm, VS Code Marketplace, PyPI, crates.io, RubyGems, Hex
- Version source of truth: first `## [x.y.z]` heading in CHANGELOG.md, validated against package.json
- Every publish job is idempotent — safe to re-run after partial failure
- All git mutations (tag, commit, push) happen in a single `finalize` job

## Principles

- No tests in the publish workflow — tests run on PRs via `tests.yml`
- Single atomic finalize — one commit, one push, eliminates race conditions
- Each registry gets its own job — failures are isolated, re-runnable
- Version sync is centralized in `scripts/sync-sdk-versions.cjs`

## Details

### Job Dependency Graph

```
prepare → [npm, vscode, pypi, crates, rubygems, hex] → finalize → report
```

All six publish jobs run in parallel after `prepare`. `finalize` waits for all of them (skipped jobs are OK, failures block finalize). `report` always runs.

### Triggers

**Push to main**: publishes all targets if CHANGELOG.md version has no matching tag.

**Manual dispatch**: `workflow_dispatch` with a `targets` input — comma-separated list (`npm,vscode,pypi`) or `all`. Use this to re-run specific failed targets.

Concurrency group `publish` with `cancel-in-progress: false` prevents overlapping runs.

### `prepare` Job

1. Build the project
2. Extract version from CHANGELOG.md, skip if `v{version}` tag exists
3. Validate version matches `package.json`
4. Run `sync-sdk-versions.cjs` (updates all SDK version files)
5. Build `EXAMPLES.md` via `npm run build:fixtures`
6. Generate release notes from CHANGELOG.md
7. Upload all generated/synced files as `publish-artifacts`

Outputs: `version`, `skip`, `targets`.

### Publish Jobs

Each job: checkout → download synced artifacts (if SDK) → idempotency check → publish.

| Target | Registry | Idempotency Check | Secrets |
|--------|----------|-------------------|---------|
| npm | npmjs.org | `npm view mlld@$VERSION` | `NPM_TOKEN` |
| vscode | VS Code Marketplace | — | `VSCE_TOKEN` |
| pypi | pypi.org | `curl pypi.org/pypi/mlld-sdk/$VERSION/json` | OIDC (trusted publishing) |
| crates | crates.io | `curl crates.io/api/v1/crates/mlld/$VERSION` | `CRATES_IO_TOKEN` |
| rubygems | rubygems.org | `curl rubygems.org/api/v1/versions/mlld.json` | `RUBYGEMS_API_KEY` |
| hex | hex.pm | `curl hex.pm/api/packages/mlld` | `HEX_API_KEY` |

The npm job builds the project itself (needs `dist/`). SDK jobs download `publish-artifacts` to get synced version files. VS Code uploads its `package.json`/`package-lock.json` bump as a separate `vscode-bump` artifact.

### `finalize` Job

Runs only if no publish job failed (skipped is OK).

1. Download all artifacts, overlay onto checkout
2. Stage changed files: EXAMPLES.md, SDK version files, VS Code bump
3. Single commit: `chore: release v{version} [skip ci]`
4. Create tags: `v{version}` and `sdk/go/v{version}`
5. Push commit and tags (separately, for idempotency)
6. Create GitHub Release from release notes

The `[skip ci]` in the commit message prevents the workflow from re-triggering. The `github.actor != 'github-actions[bot]'` check on `prepare` is a belt-and-suspenders fallback.

### `report` Job

Always runs. Writes a summary table of all job results to `$GITHUB_STEP_SUMMARY`.

### Version Sync (`scripts/sync-sdk-versions.cjs`)

Reads version from `package.json`, writes to each SDK's manifest with format conversion:

| SDK | File | Format |
|-----|------|--------|
| Python | `sdk/python/pyproject.toml` | PEP 440: `2.0.0` |
| Rust | `sdk/rust/Cargo.toml` | SemVer: `2.0.0` |
| Ruby | `sdk/ruby/mlld.gemspec` | RubyGems: `2.0.0` |
| Elixir | `sdk/elixir/mix.exs` | Hex: `2.0.0` |
| Go | git tag only | `sdk/go/v2.0.0` |

### npm Publish (`scripts/publish-with-mlldx.cjs`)

Publishes both `mlld` and `mlldx` packages with the same tag. Syncs mlldx version first via `npm run sync:mlldx`. Adds `--provenance` in CI for npm package signing via OIDC.

## Gotchas

- The package.json script is `pub`, not `publish:all` — the workflow calls the script directly via `node scripts/publish-with-mlldx.cjs`
- Go SDK has no publish job — it uses git tags (`sdk/go/v{version}`), pkg.go.dev indexes automatically
- PyPI uses OIDC trusted publishing (no API key secret needed)
- `cargo publish --allow-dirty` is required because synced `Cargo.toml` isn't committed yet at publish time
- If finalize fails after some packages published, re-run with `workflow_dispatch` — idempotency checks skip already-published targets

## Debugging

Re-run a specific target after failure:
```
gh workflow run publish.yml -f targets=crates
```

Check what version would be published:
```bash
grep -m1 '^## \[' CHANGELOG.md
node -p "require('./package.json').version"
```

Test SDK version sync locally:
```bash
node scripts/sync-sdk-versions.cjs
git diff sdk/
```
