# Security J2B Agent Notes

## How to Run

```bash
mlld j2bd/security/index.mld
```

## How to Test Atoms

Atoms should have working ```mlld examples. To test:

```bash
# Validate atom parses
mlld validate docs/src/atoms/security/some-atom.md

# Extract and run examples (manual for now)
# Copy code block to tmp/test.mld
mlld tmp/test.mld
```

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

(Add discoveries during iteration)

### 2026-01-30
- Initial setup of j2bd loop
