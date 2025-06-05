# Standard Practices for Open Source Repository Management

## What We're Doing That's Non-Standard

1. **Two branches with different content** - Very unusual
2. **"Clean" branch for public consumption** - Most projects don't do this
3. **Asking users to fork from non-default branch** - Goes against GitHub UX

## What Successful Projects Actually Do

### TypeScript
- **Approach**: Everything in main branch
- **Dev files**: `.vscode/`, `scripts/`, internal docs all included
- **Clean distribution**: via npm package `files` field
- **Why it works**: Transparency, easy contribution

### Prettier
- **Approach**: All files in main
- **Dev files**: `.github/`, `scripts/`, `website/` all visible
- **Clean distribution**: npm ignores unnecessary files
- **Why it works**: Simple, no branch confusion

### ESLint  
- **Approach**: Single main branch
- **Dev files**: In `.gitignore` (local only)
- **Shared configs**: Template files in `templates/`
- **Why it works**: Each dev controls their environment

### React
- **Approach**: Monorepo with everything visible
- **Dev files**: All included in repo
- **Clean distribution**: Build process handles it
- **Why it works**: Professional, transparent

## The Problem with "Clean" Public Branches

1. **It signals "this is the built/compiled version"** - But it's not
2. **Contributors get confused** - Where do I contribute?
3. **It breaks GitHub's model** - PRs, forks, issues all assume single source of truth
4. **It requires maintenance** - Keeping branches in sync is error-prone

## Why Projects Include Dev Files

1. **Transparency** - Shows how the sausage is made
2. **Onboarding** - New contributors can see your workflow
3. **Testing** - CI/CD needs these files
4. **Documentation** - Dev docs belong with code

## Better Ways to Handle "Cleanliness"

### For Git Repos:
- **README sections**: "For Users" vs "For Contributors"
- **Folder structure**: `src/` vs `.dev/` or `scripts/`
- **Documentation**: Clear separation of user vs dev docs

### For Distribution:
- **npm**: Use `files` field in package.json
- **Releases**: Use GitHub releases with cleaned archives
- **CI/CD**: Build and publish cleaned versions automatically

## Red Flags in Your Current Approach

1. 🚩 "Fork from dev, not main"
2. 🚩 Complex GitHub Actions to clean branches
3. 🚩 Branch protection issues due to different content
4. 🚩 Lost files when merging wrong direction
5. 🚩 Need for custom scripts like `prepare-main`

## The Standard Way

```json
// package.json
{
  "files": [
    "dist/",
    "bin/",
    "src/",
    "README.md",
    "LICENSE"
  ]
}
```

This automatically excludes everything else from npm, including:
- CLAUDE.md, .cursorrules, etc.
- Test files
- Dev scripts
- Documentation source
- CI/CD configs

But keeps everything in your single main branch for contributors.

## Decision Framework

Ask yourself:
1. **Is hiding dev files worth the complexity?** Usually no.
2. **Will contributors be confused?** With two branches, yes.
3. **Is there sensitive information?** Use .gitignore or env variables.
4. **Do other successful projects do this?** No, they don't.

## Recommendation

**Merge dev into main permanently and use standard practices.** Your repository will be:
- Easier to contribute to
- Less confusing
- More maintainable  
- Following established patterns
- Still clean for npm users (via `files` field)