# Release Guide for Contributors

This document outlines the process for maintaining the separation between development files and the clean public repository.

## Repository Structure

The repository is organized to allow developers to work with additional files and directories without polluting the public branch:

- **Development branches**: Contains working directories like `_meld/`, `dev/`, and temporary files
- **Public branch**: Clean version of the codebase without development-only files

## Working with Development Files

Feel free to create working files in:
- `_meld/` - For collaborative work, analysis, and documentation
- `dev/` - For development notes and planning
- `tmp/` - For temporary files

These directories are ignored in the public branch and won't be included in releases.

## Preparing for a Public Release

When you're ready to contribute code that will be included in a public release:

1. Run our clean-up script to create/update a clean branch:
   ```bash
   scripts/prepare-public-branch.sh
   ```

2. Review the clean branch to ensure it contains only what should be public:
   ```bash
   git checkout public
   git ls-files | grep -E "^(_meld|dev|tmp)/"  # Should return nothing
   ```

3. Create your pull request from the clean branch, not your development branch.

## Maintaining Development and Public Branches

To keep your development branch and the public branch in sync:

1. Make changes in your development branch as usual
2. When ready to update the public branch:
   ```bash
   scripts/sync-with-dev-branch.sh
   ```

3. Push the public branch to your fork for PRs:
   ```bash
   git push -u origin public
   ```

## Git Hooks

We've provided git hooks to prevent accidental commits of development files to protected branches:

```bash
scripts/setup-git-hooks.sh
```

These hooks will block commits of ignored directories and files to the main and public branches.

## CI Checks

Our GitHub Actions workflow will check for ignored files in PRs to the main branch as an additional safeguard.

## Questions?

If you have any questions about this process, please open an issue or reach out to the maintainers.

---

Remember: Keep your development files local, but don't let them interfere with contributing clean code!