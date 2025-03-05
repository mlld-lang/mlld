# Development Resources

This directory contains development-only resources, documentation, and utilities for Meld. These files are not included in the public repository branch (`main`).

## Development Workflow

Meld uses a "clean repository" approach with the following workflow:

1. **Branch Structure**:
   - `dev`: The full development branch containing all resources and development files
   - `main`: The clean, public-facing branch that users see (published to npm)
   - Feature branches: Created from `dev` for all new work

2. **Development Process**:
   - Create feature branches from `dev`: `git checkout -b feature/my-feature dev`
   - Make changes and commit to your feature branch
   - Keep your branch updated: `npm run sync-dev`
   - Create a PR to merge your feature branch into `dev`

3. **Release Process**:
   - When ready to release, bump the version on `dev`:
     - `npm run bump:patch` (or `bump:minor` or `bump:major`)
   - Create a PR from `dev` to `main` (required if `main` is protected)
   - Once the PR is approved and merged, GitHub Actions will:
     - Build the project
     - Run tests
     - Publish to npm if version has changed

4. **Branch Management Scripts**:
   - `npm run prepare-main` - Updates the `main` branch as a clean version of `dev`
   - `npm run sync-dev` - Keeps feature branches in sync with `dev`
   - `npm run sync-main-to-dev` - Syncs `main` to `dev` when `main` is updated separately
   - `npm run bump` - Bumps patch version in package.json
   - `npm run bump:patch/minor/major` - Bumps specific version type

## Development Guidelines

When adding development resources:

1. Place them in the appropriate directory:
   - `/dev/` for general development resources
   - `/_issues/` for issue tracking and documentation
   - `/tmp/` for temporary files

2. Make sure they are excluded from the main branch by adding them to the ignore list in `scripts/prepare-main.js` if needed

## Automated NPM Publishing

The project uses GitHub Actions to automatically publish to npm when changes are pushed to the `main` branch. The workflow:

1. Triggers on pushes to `main` (when package.json or code files change)
2. Builds the project and runs tests
3. Compares the version in package.json with the published version
4. Publishes to npm if the version has increased

For setup details, see `dev/AUTO_PUBLISH.md`.

## Protected Branch Setup

For proper governance, the `main` branch should be protected on GitHub:

1. Go to repository Settings → Branches → Branch protection rules
2. Add a rule for the `main` branch
3. Enable "Require a pull request before merging"
4. Add any other desired protections (status checks, approvals, etc.)

This ensures all changes to `main` go through proper review before being published.