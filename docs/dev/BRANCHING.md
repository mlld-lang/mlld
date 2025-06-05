# Mlld Branching Strategy

## Overview

The mlld project uses a two-branch strategy to separate development resources from the public release:

- **`dev` branch**: Contains all development files, documentation, and tools
- **`main` branch**: Clean public-facing branch with only production code

## Critical Rules

### 1. Always Branch from `dev`
**NEVER branch from `main` for development work.** The main branch lacks development files and tools.

```bash
# ✅ CORRECT
git checkout dev
git pull origin dev
git checkout -b feature/my-new-feature

# ❌ WRONG - Will lose dev files!
git checkout main
git checkout -b feature/my-new-feature
```

### 2. One-Way Flow: dev → main
The flow is strictly one-directional:
- Changes flow from `dev` to `main` via the `prepare-main` script
- **NEVER merge `main` back into `dev`** (this will delete development files!)

### 3. Use `prepare-main` for Releases
To update the main branch:

```bash
# From the dev branch with clean working directory
npm run prepare-main
```

This script:
- Verifies you're on the dev branch
- Creates a temporary clean branch
- Removes all development-only files and directories
- Updates the main branch with the clean version

## What Gets Removed for Main

The following are removed when creating the main branch:

### Directories
- `_meld/`, `_issues/`, `dev/`, `tmp/`, `logs/`
- `error-display-demo/`
- `docs/dev/`
- `.claude/`, `.windsurf/`, `.continue/`, `.aider/`, `.sourcegraph/`

### Files
- `CLAUDE.md`, `AGENTS.md`
- `.cursorrules`, `.aidigestignore`, `cursor.md`, `.cursorignore`
- `.copilotignore`, `.sourcery.yaml`
- `windsurf.md`, `.windsurf*`
- `prepare-main.js`
- Test files: `test_*.txt`, `test_*.mjs`, `test_output.log`
- `diff.txt`, `repomix-output.xml`, `.repomixignore`

## Common Scenarios

### Starting New Feature Work
```bash
git checkout dev
git pull origin dev
git checkout -b feature/awesome-feature
# Work on your feature...
```

### Creating a Pull Request
1. Push your feature branch
2. Create PR targeting `dev` branch (NOT main!)
3. After review and merge to dev, changes will be promoted to main in next release

### Fixing Lost Development Files
If you accidentally lose dev files (e.g., by merging from main):

1. **DON'T PANIC** - The files are in git history
2. Check out a fresh dev branch:
   ```bash
   git checkout dev
   git pull origin dev
   ```
3. If files are still missing, they can be restored from git history

### Release Process
1. Ensure all changes are merged to dev
2. Run tests and verify everything works
3. From dev branch: `npm run prepare-main`
4. Push main: `git push --force-with-lease origin main`
5. Tag the release on main branch

## GitHub Actions

The `.github/workflows/clean-repo.yml` workflow automatically checks that development files don't exist in:
- Push events to main
- Pull requests targeting main

This prevents accidental inclusion of development files in the public release.

## Why This Strategy?

1. **Clean Public Release**: Users get only what they need, no dev clutter
2. **Rich Development Environment**: Developers have all tools, docs, and helpers
3. **Prevents Accidents**: One-way flow prevents losing development resources
4. **Automated Checks**: GitHub Actions ensure main stays clean

## Quick Reference

| Action | Branch | Command |
|--------|--------|---------|
| Start new work | dev | `git checkout -b feature/name` |
| View dev docs | dev | Available in `docs/dev/` |
| Create PR | dev | Target: `dev` branch |
| Release to main | dev | `npm run prepare-main` |
| Install package | main | Users: `npm install mlld` |

Remember: When in doubt, work from `dev`!