# Migration Plan: Moving to Standard Repository Structure

## Quick Decision Guide

**Option A: Keep AI files in repo** (Like TypeScript, Prettier)
- Everything stays in main branch
- Use npm `files` field for clean distribution
- Most transparent and standard approach

**Option B: Gitignore AI files** (Like ESLint)
- AI config files in .gitignore
- Provide templates in docs/dev/templates/
- Each dev manages their own AI setup

## Migration Steps for Option A (Recommended)

### 1. Update package.json files field
```json
{
  "files": [
    "dist/",
    "bin/",
    "LICENSE",
    "README.md",
    "CHANGELOG.md"
  ]
}
```

This ensures npm package only includes necessary files.

### 2. Merge dev → main with everything
```bash
git checkout main
git merge dev --strategy=ours  # Ignore main's version
git checkout dev -- .           # Take everything from dev
git commit -m "feat: unify branches - adopt standard repository structure"
```

### 3. Remove/Archive unused workflows
- Delete `.github/workflows/auto-clean-main.yml`
- Delete `.github/workflows/clean-repo.yml`
- Or move them to `archived/` with explanation

### 4. Update documentation
- Update README.md to remove branch-specific instructions
- Update CONTRIBUTING.md to remove dev branch mentions
- Add section about developer setup including AI tools

### 5. Archive prepare-main script
```bash
mkdir -p scripts/archived
git mv prepare-main.js scripts/archived/
# Add README explaining why it's archived
```

### 6. Set main as default branch
- GitHub Settings → General → Default branch → main
- Delete dev branch after confirming everything works

### 7. Update CI/CD
- Ensure all workflows point to main
- Remove any branch-specific logic

## Migration Steps for Option B

### 1. Add AI files to .gitignore
```gitignore
# AI Development Tools
CLAUDE.md
AGENTS.md
.cursorrules
.claude/
.windsurf/
.aider/
*.ai.md

# But allow templates
!docs/dev/templates/
```

### 2. Create templates
```bash
mkdir -p docs/dev/templates
cp CLAUDE.md docs/dev/templates/CLAUDE.md.template
cp .cursorrules docs/dev/templates/cursorrules.template
```

### 3. Add setup instructions
Create `docs/dev/AI-SETUP.md` with instructions for developers to copy templates.

### 4. Follow steps 2-7 from Option A

## Post-Migration Checklist

- [ ] Single main branch works for everything
- [ ] Contributors can fork and PR normally  
- [ ] No complex branch management needed
- [ ] npm package is still clean (test with `npm pack --dry-run`)
- [ ] Documentation is updated
- [ ] CI/CD is simplified
- [ ] No more "fork from dev" confusion

## Testing the Migration

1. **Test npm package**:
   ```bash
   npm pack --dry-run
   # Verify only intended files are included
   ```

2. **Test fresh clone**:
   ```bash
   git clone <repo> test-clone
   cd test-clone
   npm install
   npm test
   ```

3. **Test PR workflow**:
   - Create a test PR
   - Ensure no cleaning happens
   - Merge normally

## Rollback Plan

If issues arise:
1. The dev branch still exists with full history
2. Can recreate two-branch setup if absolutely needed
3. But try to fix forward instead of rolling back

## Benefits After Migration

- ✅ Standard GitHub workflow
- ✅ No contributor confusion
- ✅ Simpler maintenance
- ✅ No lost files from wrong merges
- ✅ Better discoverability
- ✅ Follows open source best practices

## Example README section after migration

```markdown
## For Contributors

This repository includes development configuration files for various AI assistants 
(CLAUDE.md, .cursorrules, etc.) to help with development. These files are excluded 
from the npm package but included in the repository for transparency and ease of 
contribution.

### Repository Structure
- `src/` - Source code
- `docs/` - User documentation  
- `docs/dev/` - Developer documentation
- `examples/` - Usage examples
- Root directory includes AI assistant configurations
```