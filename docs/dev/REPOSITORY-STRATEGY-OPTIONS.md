# Repository Strategy Options for Mlld

## Current Issues
- Two-branch strategy (dev/main) is non-standard and confusing
- Contributors don't know to fork from dev
- GitHub defaults work against us
- Maintaining two branches with different content is complex

## Option 1: Standard Single-Branch Approach (Recommended)

### How it works:
1. Everything lives in `main` branch
2. Dev files are `.gitignore`d (never committed)
3. Each developer has their own local dev files
4. Share dev file templates in `docs/dev/templates/`

### Implementation:
```bash
# .gitignore
CLAUDE.md
AGENTS.md
.cursorrules
.claude/
.windsurf/
*.log
tmp/
_meld/

# But allow templates
!docs/dev/templates/
```

### Pros:
- ✅ Standard GitHub workflow
- ✅ No confusion about branches
- ✅ Simple for contributors
- ✅ No sync issues

### Cons:
- ❌ Developers need to set up their own AI tool files
- ❌ Can't share active dev configurations

---

## Option 2: Build-Time Cleaning (Also Standard)

### How it works:
1. Everything in `main` (including CLAUDE.md, etc.)
2. Build process creates clean dist/
3. NPM publish includes only dist/ and essential files
4. GitHub repo has everything, NPM package is clean

### Implementation:
```json
// package.json
{
  "files": [
    "dist/",
    "bin/",
    "README.md",
    "LICENSE"
  ]
}
```

### Pros:
- ✅ Can share all dev files
- ✅ Standard workflow
- ✅ NPM users get clean package
- ✅ GitHub contributors get full context

### Cons:
- ❌ GitHub repo contains "noise" for casual browsers
- ❌ Larger clone size

---

## Option 3: Default Branch Switch (Compromise)

### How it works:
1. Make `dev` the default branch on GitHub
2. Keep current two-branch strategy
3. Update docs to clarify

### Implementation:
- Settings → General → Default branch → Change to `dev`
- Update README in both branches with clear notices

### Pros:
- ✅ Keeps current strategy
- ✅ Forks will use dev by default
- ✅ PRs will target dev by default

### Cons:
- ❌ Still non-standard
- ❌ Main branch seems abandoned
- ❌ Requires clear documentation

---

## Option 4: Monorepo/Workspaces (Advanced)

### How it works:
1. Use npm workspaces or lerna
2. Separate packages for public/dev

### Structure:
```
mlld/
├── packages/
│   ├── mlld/        (public package)
│   └── mlld-dev/    (dev tools)
├── CLAUDE.md
└── package.json
```

### Pros:
- ✅ Clean separation
- ✅ Can publish multiple packages
- ✅ Professional structure

### Cons:
- ❌ More complex
- ❌ Overkill for this project
- ❌ Harder for contributors

---

## Option 5: Embrace the Mess (Pragmatic)

### How it works:
1. Keep everything in main
2. Add clear sections in README
3. Use folder structure to organize

### Structure:
```
mlld/
├── src/           (core code)
├── docs/          (user docs)
├── .dev/          (developer files)
│   ├── CLAUDE.md
│   ├── AGENTS.md
│   └── templates/
└── README.md
```

### Pros:
- ✅ Simple and honest
- ✅ Everything visible
- ✅ Standard workflow
- ✅ No hidden surprises

### Cons:
- ❌ Repository looks less "clean"
- ❌ Some users might be confused by dev files

---

## Recommendation

**Go with Option 1 or Option 2** - these are the most standard approaches used by successful open source projects.

### Examples from Popular Projects:
- **TypeScript**: Uses Option 2 (everything in repo, clean npm package)
- **React**: Uses Option 2 with monorepo
- **ESLint**: Uses Option 1 (.gitignore dev files)
- **Prettier**: Uses Option 2

### Migration Path:
1. Choose approach
2. Merge dev → main with all content
3. Update .gitignore or package.json files list
4. Archive the prepare-main script
5. Remove complex GitHub Actions
6. Update contributing docs

The key insight: **It's better to be standard and slightly messy than clean but confusing.**