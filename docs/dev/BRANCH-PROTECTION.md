# Branch Protection Setup for Mlld

## Recommended GitHub Branch Protection Rules

### For `main` branch:

1. **Go to Settings → Branches → Add protection rule**
2. **Branch name pattern:** `main`

### Configure these settings:

#### ✅ Protect matching branches
- [x] **Require pull request reviews before merging**
  - Required approving reviews: 1
  - [ ] Dismiss stale pull request approvals when new commits are pushed
  - [x] Require review from CODEOWNERS (if you have a CODEOWNERS file)
  
- [x] **Require status checks to pass before merging**
  - Required status checks:
    - `test` (from test.yml workflow)
    - `check-clean` (from clean-repo.yml workflow)
    - `auto-clean` (from auto-clean-main.yml workflow)
  - [x] Require branches to be up to date before merging

- [x] **Require conversation resolution before merging**

- [ ] **Require signed commits** (optional, based on team preference)

- [x] **Include administrators** (recommended to prevent accidental direct pushes)

- [x] **Restrict who can push to matching branches**
  - Add specific users or teams who can merge to main
  - This prevents accidental pushes from other branches

#### ⚠️ Do NOT enable:
- [ ] **Allow force pushes** - The auto-clean process handles everything
- [ ] **Allow deletions** - Protect the main branch from deletion

### For `dev` branch:

1. **Branch name pattern:** `dev`
2. **Less restrictive settings:**
   - [x] Require pull request reviews (optional, based on team size)
   - [x] Require status checks (just the test workflow)
   - [ ] Include administrators (allow admins to push directly for quick fixes)

## How It Works

1. **Developer creates PR from feature branch → dev**
   - Normal review process
   - Tests must pass
   - No automatic cleaning (dev keeps all files)

2. **Release Manager creates PR from dev → main**
   - Auto-clean workflow runs automatically
   - Removes all development files
   - Commits the cleaned version to the PR
   - PR shows exactly what will be in main
   - Review the cleaned version
   - Merge when ready

3. **Direct pushes to main are blocked**
   - Even admins must go through PR process
   - Ensures auto-clean always runs

## Setting Up the Auto-Clean Workflow

The `.github/workflows/auto-clean-main.yml` workflow:
- Triggers on PRs to main from dev
- Automatically removes development files
- Commits the changes back to the PR
- Comments on the PR about what was cleaned

## Alternative: Manual Process

If you prefer manual control, you can:
1. Disable the auto-clean workflow
2. Use `npm run prepare-main` locally
3. Force push to main with `--force-with-lease`

But this requires turning off branch protection temporarily.

## Troubleshooting

### "PR is blocked" even from dev
- Check that all required status checks are passing
- Ensure the auto-clean workflow has completed
- Verify you have permission to merge to main

### "Cannot push to main"
- This is intentional! Use PRs instead
- For emergency fixes: temporarily disable "Include administrators"

### Auto-clean not running
- Verify the PR is from `dev` branch
- Check workflow permissions in Settings → Actions
- Ensure the workflow file is in the main branch

## CODEOWNERS (Optional)

Create `.github/CODEOWNERS` to require specific reviews:

```
# Global owners
* @username1 @username2

# Specific paths
/core/ @core-team
/docs/ @docs-team
```

This ensures the right people review changes before they reach main.