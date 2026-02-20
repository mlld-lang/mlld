# Elixir SDK Release Process

This document defines the release flow for publishing `mlld` to Hex from `sdk/elixir`.

## Scope

- Package: `mlld`
- Source: `sdk/elixir`
- Registry: Hex (`hex.pm`)
- Version source of truth: `sdk/elixir/mix.exs` (`@version`)

## Prerequisites

1. Toolchain
- Elixir 1.15+
- OTP compatible with your Elixir version

2. Accounts and auth
- Hex account with publish rights for `mlld`
- Hex API key configured (`mix hex.user auth`)

3. Runtime assumptions
- Repo is clean for the files being released
- `sdk/elixir` tests pass
- `dist/cli.cjs` is available when running integration tests

## Versioning Policy

Follow the repo’s release cadence and semantic versioning:

- `MAJOR` for breaking API/behavior changes
- `MINOR` for backwards-compatible feature additions
- `PATCH` for bug fixes/docs-only package corrections

Use prerelease tags only when intentionally publishing prereleases (e.g. `2.1.0-rc.1`).

## Release Checklist

## 1. Prepare branch

```bash
cd /Users/adam/dev/mlld
git checkout main
git pull
```

If releasing from a release branch, switch accordingly.

## 2. Update version and docs

Edit:

- `sdk/elixir/mix.exs` (`@version`)
- `sdk/elixir/README.md` (if API/behavior changed)
- `sdk/README.md` (if cross-SDK surface changed)
- root `CHANGELOG.md` (recommended)

## 3. Run quality gates

```bash
cd sdk/elixir
mix format --check-formatted
mix test
```

Expected result: no format drift, all tests passing.

## 4. Build package locally

```bash
cd sdk/elixir
mix hex.build
```

Expected output: `mlld-<version>.tar` in current directory.

Inspect package contents:

```bash
tar -tf mlld-<version>.tar
```

Confirm it contains expected files only:

- `mix.exs`
- `README.md`
- `LICENSE`
- `lib/**`

## 5. Dry-run publish (recommended)

```bash
cd sdk/elixir
mix hex.publish --dry-run
```

Fix warnings before real publish.

## 6. Publish to Hex

```bash
cd sdk/elixir
mix hex.publish
```

If prompted for API key, authenticate:

```bash
mix hex.user auth
```

## 7. Verify published artifact

Run in a temp project:

```bash
mix new /tmp/mlld_release_smoke
cd /tmp/mlld_release_smoke
```

Add dependency in `mix.exs`:

```elixir
defp deps do
  [
    {:mlld, "~> <version>"}
  ]
end
```

Then:

```bash
mix deps.get
mix deps.compile
```

Expected result: dependency resolves and compiles cleanly.

## 8. Tag and push source release

From repo root:

```bash
cd /Users/adam/dev/mlld
git add sdk/elixir sdk/README.md CHANGELOG.md
git commit -m "release(elixir): mlld <version>"
git tag elixir-sdk-v<version>
git push origin main --tags
```

## 9. Post-release checks

- Confirm package page on Hex includes latest README/docs
- Confirm downstream install works with `mix deps.get`
- Announce release in project channels (if used)

## Rollback / Recovery

Hex packages are immutable; you cannot overwrite a published version.

If a bad version is released:

1. `mix hex.retire mlld <bad_version> <reason>`
2. Publish a fixed patch version
3. Document the retirement reason in changelog/release notes

Example retirement:

```bash
cd sdk/elixir
mix hex.retire mlld <bad_version> invalid
```

Common reasons: `renamed`, `deprecated`, `security`, `invalid`, `other`.

## CI-Friendly Command Sequence

Use this sequence in CI release jobs:

```bash
cd sdk/elixir
mix format --check-formatted
mix test
mix hex.build
mix hex.publish --yes
```

Set Hex API key in CI secrets (`HEX_API_KEY`) and ensure non-interactive auth is configured.

## Notes For This Repository

- Elixir SDK is designed to align with behavior from `sdk/go`, `sdk/python`, `sdk/ruby`, and `sdk/rust`.
- Integration tests use local `dist/cli.cjs`; ensure CLI build is up to date before release.
- If your environment lacks CA certs, Hex operations can fail before auth; fix CA trust store first.
