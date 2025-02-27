#!/bin/bash

# Script to set up git hooks for preventing commits of ignored files to main/public branches

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Setting up git hooks for the repository${NC}"

# Check if we're in a git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo -e "${RED}Error: Not in a git repository${NC}"
  exit 1
fi

# Create hooks directory if it doesn't exist
mkdir -p .git/hooks

# Create pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash

# Pre-commit hook to prevent committing ignored files to protected branches

# Get current branch
BRANCH=$(git symbolic-ref --short HEAD)
PROTECTED_BRANCHES=("main" "public")

# Check if we're on a protected branch
IS_PROTECTED=0
for protected in "${PROTECTED_BRANCHES[@]}"; do
  if [[ "$BRANCH" == "$protected" ]]; then
    IS_PROTECTED=1
    break
  fi
done

if [[ $IS_PROTECTED -eq 1 ]]; then
  # Directories to check
  IGNORED_DIRS=("_meld" "dev" "tmp")
  
  # Files to check
  IGNORED_PATTERNS=("diff.txt" "test_*.txt" "test_*.mjs" "test_output.log" "repomix-output.xml" ".repomixignore")
  
  # Check for ignored directories in staged files
  for dir in "${IGNORED_DIRS[@]}"; do
    STAGED_FILES=$(git diff --cached --name-only | grep "^${dir}/")
    if [[ -n "$STAGED_FILES" ]]; then
      echo -e "\033[0;31mError: Attempting to commit files from ignored directory '${dir}' to protected branch '${BRANCH}'\033[0m"
      echo "The following files were staged:"
      echo "$STAGED_FILES"
      echo -e "\033[1;33mPlease remove these files before committing to ${BRANCH}\033[0m"
      exit 1
    fi
  done
  
  # Check for ignored file patterns in staged files
  for pattern in "${IGNORED_PATTERNS[@]}"; do
    STAGED_FILES=$(git diff --cached --name-only | grep -E "${pattern}")
    if [[ -n "$STAGED_FILES" ]]; then
      echo -e "\033[0;31mError: Attempting to commit ignored files matching '${pattern}' to protected branch '${BRANCH}'\033[0m"
      echo "The following files were staged:"
      echo "$STAGED_FILES"
      echo -e "\033[1;33mPlease remove these files before committing to ${BRANCH}\033[0m"
      exit 1
    fi
  done
fi

# If we get here, all checks passed
exit 0
EOF

# Make the hook executable
chmod +x .git/hooks/pre-commit

# Create pre-push hook
cat > .git/hooks/pre-push << 'EOF'
#!/bin/bash

# Pre-push hook to prevent pushing ignored files to protected branches

# Get the name of the branch being pushed
while read local_ref local_sha remote_ref remote_sha
do
  BRANCH=$(echo "$remote_ref" | sed -e 's,.*/\(.*\),\1,')
  PROTECTED_BRANCHES=("main" "public")
  
  # Check if we're pushing to a protected branch
  IS_PROTECTED=0
  for protected in "${PROTECTED_BRANCHES[@]}"; do
    if [[ "$BRANCH" == "$protected" ]]; then
      IS_PROTECTED=1
      break
    fi
  done
  
  if [[ $IS_PROTECTED -eq 1 ]]; then
    # Directories to check
    IGNORED_DIRS=("_meld" "dev" "tmp")
    
    # Files to check
    IGNORED_PATTERNS=("diff.txt" "test_*.txt" "test_*.mjs" "test_output.log" "repomix-output.xml" ".repomixignore")
    
    # Check for ignored directories
    for dir in "${IGNORED_DIRS[@]}"; do
      FILES=$(git ls-tree -r "$local_sha" --name-only | grep "^${dir}/")
      if [[ -n "$FILES" ]]; then
        echo -e "\033[0;31mError: Attempting to push files from ignored directory '${dir}' to protected branch '${BRANCH}'\033[0m"
        echo "The following files were found:"
        echo "$FILES"
        echo -e "\033[1;33mPlease remove these files before pushing to ${BRANCH}\033[0m"
        exit 1
      fi
    done
    
    # Check for ignored file patterns
    for pattern in "${IGNORED_PATTERNS[@]}"; do
      FILES=$(git ls-tree -r "$local_sha" --name-only | grep -E "${pattern}")
      if [[ -n "$FILES" ]]; then
        echo -e "\033[0;31mError: Attempting to push ignored files matching '${pattern}' to protected branch '${BRANCH}'\033[0m"
        echo "The following files were found:"
        echo "$FILES"
        echo -e "\033[1;33mPlease remove these files before pushing to ${BRANCH}\033[0m"
        exit 1
      fi
    done
  fi
done

# If we get here, all checks passed
exit 0
EOF

# Make the hook executable
chmod +x .git/hooks/pre-push

echo -e "${GREEN}Git hooks installed successfully!${NC}"
echo -e "${YELLOW}These hooks will prevent committing and pushing ignored files to protected branches (main, public).${NC}"
echo -e "${YELLOW}You can bypass the hooks with --no-verify if needed, but please don't do so for public branches.${NC}"