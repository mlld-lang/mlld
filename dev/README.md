# Development Resources

This directory contains development-only resources, documentation, and utilities for Meld. These files are not included in the public repository branch.

## Contents

- `CLEAN.md`: Documentation for the clean repository approach
- Other development-only resources and documentation

## Clean Repository Approach

Meld uses a "clean repository" approach to separate development resources from the public-facing code. This means:

1. The `dev` branch contains all development resources, including this directory
2. The `main` branch is the clean, public-facing branch without development resources

To create or update the clean main branch from dev, run:

```
npm run prepare-main
```

## Development Guidelines

When adding development resources:

1. Place them in the appropriate directory:
   - `/dev/` for general development resources
   - `/_issues/` for issue tracking and documentation
   - `/tmp/` for temporary files

2. Make sure they are excluded from the public branch by adding them to the ignore list in `scripts/prepare-public.js` if needed

For more information on the development workflow, see the main CONTRIBUTING.md file.