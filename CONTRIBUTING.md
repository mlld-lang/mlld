# Contributing to mlld

Thank you for your interest in contributing to mlld! We welcome contributions from the community to make this project better.

## Branch Structure

We use a specific branch structure to keep development organized:

- `dev`: The full development branch where all feature and bugfix branches are merged. This branch contains all development resources, documentation, and test files.
- `main`: The clean, public-facing branch without development files and directories. This is what users see and interact with.

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Build the project: `npm run build`
   - This will generate parser files and test fixtures
   - Generated files are gitignored to avoid merge conflicts
   - Syntax highlighting files are conditionally generated (see below)
4. Run the tests: `npm run test`
5. Make sure you're on the `dev` branch: `git checkout dev`

## Development Workflow

1. Always create new branches from `dev`, not from `main`: `git checkout -b feature/my-feature` or `git checkout -b fix/my-fix`
2. Make your changes
3. Run tests to ensure everything works: `npm test`
4. Run linting: `npm run lint`
5. Commit your changes with a clear commit message
6. Keep your branch up to date with dev: `npm run sync-dev`
7. Push to your fork and submit a pull request to the `dev` branch

## Code Style & Standards

- We use TypeScript for type safety
- Follow the existing code style (2-space indentation, single quotes)
- Write tests for new features and bug fixes
- Update documentation as needed
- Keep commits small and focused on a single change

## Working with Grammar and Syntax Highlighting

When making changes to the grammar (`grammar/**/*.peggy` files):

1. **Syntax files are NOT automatically regenerated** in feature branches to avoid merge conflicts
2. To test syntax highlighting changes locally: `npm run build:syntax:force`
3. **Do not commit** generated syntax files (`grammar/generated/*`) in feature branches
4. Syntax files are automatically generated when merging to main

For more details, see [docs/syntax-highlighting-build.md](docs/syntax-highlighting-build.md)

## Repository Structure

The repository is organized to separate development files from the public-facing code:

- Development directories that are excluded from the public branch:
  - `_issues/`: Issue tracking and documentation
  - `_mlld/`: Development-specific mlld files
  - `dev/`: Development utilities and scripts
  - `logs/`: Log files
  - `tmp/`: Temporary files
  - `error-display-demo/`: Error display demo and testing

## Debug Commands

We have several debug commands available:

- `npm run debug:resolution` - Debug the resolution of variables
- `npm run debug:context` - Debug the context of a file
- `npm run debug:transform` - Debug the transformation of a file

## Creating a Clean Public Version

To create or update the clean main branch from dev:

```
npm run prepare-main
```

This will update the `main` branch to be a clean version that excludes development files and directories.

## Pull Request Process

1. Update the README.md or documentation with details of changes if appropriate
2. Update the tests to cover your changes
3. Make sure your PR targets the `dev` branch, not `main`
4. Your PR needs to pass all CI checks before it can be merged
5. A maintainer will review your PR and may suggest changes
6. Once approved, your PR will be merged to `dev` and later the changes will be promoted to `main` using the prepare-main script

## Reporting Bugs

When reporting bugs, please include:

- A clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Version information (Node.js version, OS, etc.)
- Any relevant logs or error messages

## Feature Requests

We welcome feature requests! Please provide:

- A clear description of the feature
- Why it would be valuable
- Any implementation ideas you might have

## Code of Conduct

All contributors are expected to adhere to the project's Code of Conduct. Please be respectful and constructive in all interactions.

## License

By contributing to mlld, you agree that your contributions will be licensed under the project's MIT License.