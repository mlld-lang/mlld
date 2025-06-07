#!/bin/bash
# Script to create GitHub issues for ESLint cleanup

# Create each issue using GitHub CLI
gh issue create --title "ESLint Cleanup Phase 1: Auto-fixes and Generated Code" \
  --body-file ./eslint-issue-1-autofix.md \
  --label "enhancement,good first issue" \
  --milestone "ESLint Cleanup"

gh issue create --title "ESLint Cleanup Phase 2: CLI Console Output" \
  --body-file ./eslint-issue-2-cli-console.md \
  --label "enhancement,good first issue" \
  --milestone "ESLint Cleanup"

gh issue create --title "ESLint Cleanup Phase 3: TypeScript Type Safety (API & Config)" \
  --body-file ./eslint-issue-3-typescript-api-config.md \
  --label "enhancement,typescript" \
  --milestone "ESLint Cleanup"

gh issue create --title "ESLint Cleanup Phase 4: TypeScript Type Safety (Security/Registry)" \
  --body-file ./eslint-issue-4-typescript-security.md \
  --label "enhancement,typescript" \
  --milestone "ESLint Cleanup"

gh issue create --title "ESLint Cleanup Phase 5: Test File Cleanup" \
  --body-file ./eslint-issue-5-test-cleanup.md \
  --label "enhancement,testing" \
  --milestone "ESLint Cleanup"

gh issue create --title "ESLint Cleanup Phase 6: Custom AST Rule Refinement" \
  --body-file ./eslint-issue-6-ast-rules.md \
  --label "enhancement,refactor" \
  --milestone "ESLint Cleanup"

gh issue create --title "ESLint Cleanup Phase 7: Unused Variables and Imports" \
  --body-file ./eslint-issue-7-unused-vars.md \
  --label "enhancement,good first issue" \
  --milestone "ESLint Cleanup"

gh issue create --title "ESLint Cleanup Phase 8: Final Polish and CI Integration" \
  --body-file ./eslint-issue-8-final-polish.md \
  --label "enhancement,documentation" \
  --milestone "ESLint Cleanup"

echo "All issues created!"