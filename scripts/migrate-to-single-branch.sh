#!/bin/bash
# Script to migrate from two-branch to single-branch structure

echo "🚀 Starting migration to single-branch structure..."

# Check we're on dev branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "dev" ]; then
    echo "❌ Error: Must be on dev branch to run migration"
    echo "   Current branch: $CURRENT_BRANCH"
    exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "❌ Error: Working directory has uncommitted changes"
    echo "   Please commit or stash changes first"
    exit 1
fi

echo "✅ On dev branch with clean working directory"

# Create a migration branch
echo "📝 Creating migration branch..."
git checkout -b migration/single-branch

# Remove old branch-specific workflows
echo "🗑️  Removing branch-specific workflows..."
rm -f .github/workflows/auto-clean-main.yml
rm -f .github/workflows/clean-repo.yml
rm -f prepare-main.js

# Update CONTRIBUTING.md to remove branch-specific instructions
echo "📝 Updating documentation..."
if [ -f "CONTRIBUTING.md" ]; then
    # This is a simplified update - you may need to manually review
    sed -i.bak 's/dev branch/main branch/g' CONTRIBUTING.md
    sed -i.bak '/prepare-main/d' CONTRIBUTING.md
    rm CONTRIBUTING.md.bak
fi

# Stage all changes
git add -A

# Commit if there are changes
if [ -n "$(git status --porcelain)" ]; then
    git commit -m "chore: remove branch-specific workflows and scripts

- Remove auto-clean-main.yml workflow
- Remove clean-repo.yml workflow  
- Remove prepare-main.js script
- Update documentation for single-branch model"
fi

echo "✅ Migration branch prepared"
echo ""
echo "📋 Next steps:"
echo "1. Review the changes on migration/single-branch"
echo "2. Push this branch: git push origin migration/single-branch"
echo "3. Create a PR from migration/single-branch to main"
echo "4. After merging, set main as the default branch on GitHub"
echo "5. Archive or delete the dev branch"
echo ""
echo "Note: The main branch will now contain all files including CLAUDE.md,"
echo "but npm packages will remain clean thanks to the files field in package.json"