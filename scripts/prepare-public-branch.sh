#!/bin/bash

# Script to prepare a clean public branch from the development branch

# Usage instructions
usage() {
  echo "Usage: $0 [options]"
  echo "Options:"
  echo "  -b, --branch NAME   Create/update a clean branch with NAME (default: public)"
  echo "  -h, --help          Show this help message"
  exit 1
}

# Default values
PUBLIC_BRANCH="public"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -b|--branch)
      PUBLIC_BRANCH="$2"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown option: $1"
      usage
      ;;
  esac
done

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Preparing clean public branch: ${PUBLIC_BRANCH}${NC}"

# Check if we're in a git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo -e "${RED}Error: Not in a git repository${NC}"
  exit 1
fi

# Save current branch
CURRENT_BRANCH=$(git symbolic-ref --short HEAD)
echo -e "Current branch: ${GREEN}${CURRENT_BRANCH}${NC}"

# Get latest changes
echo "Fetching latest changes..."
git fetch origin

# Check if public branch exists locally
if git show-ref --verify --quiet refs/heads/${PUBLIC_BRANCH}; then
  echo -e "${YELLOW}Branch ${PUBLIC_BRANCH} already exists locally${NC}"
else
  echo -e "Creating new branch ${GREEN}${PUBLIC_BRANCH}${NC} from ${CURRENT_BRANCH}"
  git branch ${PUBLIC_BRANCH}
fi

# Switch to public branch
echo -e "Switching to ${GREEN}${PUBLIC_BRANCH}${NC} branch"
git checkout ${PUBLIC_BRANCH}

# Get latest from current branch
echo "Merging changes from ${CURRENT_BRANCH}"
git merge --no-commit ${CURRENT_BRANCH}

# Create temporary working directory
TEMP_DIR=$(mktemp -d)
echo "Created temporary directory: ${TEMP_DIR}"

# Directories to remove for clean repo
REMOVE_DIRS="_meld dev tmp"

# Files to remove
REMOVE_FILES="diff.txt test_*.txt test_*.mjs test_output.log repomix-output.xml .repomixignore"

# Remove directories
for dir in $REMOVE_DIRS; do
  if [ -d "$dir" ]; then
    echo -e "Removing directory: ${RED}${dir}${NC}"
    rm -rf "$dir"
    git rm -rf --cached "$dir" > /dev/null 2>&1
  fi
done

# Remove files
for pattern in $REMOVE_FILES; do
  find . -name "$pattern" -type f -not -path "*/node_modules/*" -not -path "*/dist/*" | while read file; do
    echo -e "Removing file: ${RED}${file}${NC}"
    rm -f "$file"
    git rm --cached "$file" > /dev/null 2>&1
  done
done

# Commit the changes
echo "Committing changes"
git commit -m "Clean up repository for public release"

# Instructions for next steps
echo -e "\n${GREEN}Branch ${PUBLIC_BRANCH} is now ready!${NC}"
echo -e "${YELLOW}To push to remote:${NC}"
echo -e "  git push -u origin ${PUBLIC_BRANCH}"
echo -e "${YELLOW}To switch back to your development branch:${NC}"
echo -e "  git checkout ${CURRENT_BRANCH}"
echo -e "${YELLOW}Remember to merge new changes from ${CURRENT_BRANCH} to ${PUBLIC_BRANCH} before pushing publicly.${NC}"

# Switch back to the original branch
git checkout ${CURRENT_BRANCH}
echo -e "\nSwitched back to ${GREEN}${CURRENT_BRANCH}${NC}"