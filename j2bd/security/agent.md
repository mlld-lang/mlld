# Security J2B Agent Notes

## How to Run

```bash
mlld j2bd/security/index.mld
```

## How to Test Atoms

Atoms should have working ```mlld examples. To test:

```bash
# DON'T use validate for docs - it has a bug with labels
# Instead, extract code blocks and run directly:
# Copy code block to tmp/test.mld
mlld tmp/test.mld
```

**Note:** `mlld validate` fails on files with labeled variables due to a bug ("Cannot use 'in' operator to search for 'body'"). Use `mlld <file>` directly instead.

## Atom Format

Each atom needs frontmatter:

```yaml
---
id: labels-overview
title: Labels Overview
brief: What labels are and why they matter
category: security
parent: security
tags: [labels, taint, tracking]
related: [labels-source-auto, labels-propagation]
updated: 2026-01-30
---
```

## Key Files

- Spec: `todo/spec-security-2026-v4.md` - the source of truth
- Current atoms: `docs/src/atoms/security/`
- User docs: `docs/user/security.md` - ~800 lines, partial coverage
- Plan: `j2bd/security/plan.md` - tracks progress

## Implementation Status

Some v4 features are not fully implemented:
- `with { privileged: true }` for user guards - policy guards auto-privileged
- `@mlld/env-sprites` - placeholder only
- Audit ledger - partial (mlld-si08.6)
- Standard policy modules - need verification

When writing atoms, note what's implemented vs planned.

## Learnings

### 2026-01-31
- `mlld validate` has a bug with labeled variables - use `mlld <file>` to test directly
- Atom examples use bare directives (no `/` prefix) - works in both .mld and .md
- `exe <label> @name(params) = ...` works but only with specific RHS (templates, when, run blocks)
- Label names on exe must be identifiers like `network`, `destructive` - not namespaced like `net:w`
- The v4 spec mentions `net:w` but implementation uses plain identifiers
- Policy syntax differs from spec: use `var @config = {...}` + `policy @p = union(@config)` not `policy @name = {...}`
- Testing taint: use `show @var.mx.taint | @json` to see full provenance
- Taint includes both source markers (src:file, dir:*) AND user labels (secret, pii)

### 2026-01-30
- Initial setup of j2bd loop
