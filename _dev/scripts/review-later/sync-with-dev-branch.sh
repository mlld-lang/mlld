#!/bin/bash

# Script to sync the public branch with the development branch
# while keeping it clean of development artifacts

# Usage instructions
usage() {
  echo "Usage: $0 [options]"
  echo "Options:"
  echo "  -d, --dev NAME      Development branch name (default: main)"
  echo "  -p, --public NAME   Public branch name (default: public)"
  echo "  -h, --help          Show this help message"
  exit 1
}

# Default values
DEV_BRANCH="main"
PUBLIC_BRANCH="public"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -d|--dev)
      DEV_BRANCH="$2"
      shift 2
      ;;
    -p|--public)
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

echo -e "${YELLOW}Syncing clean public branch (${PUBLIC_BRANCH}) with development branch (${DEV_BRANCH})${NC}"

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

# Check if public branch exists
if ! git show-ref --verify --quiet refs/heads/${PUBLIC_BRANCH}; then
  echo -e "${RED}Error: Public branch ${PUBLIC_BRANCH} does not exist${NC}"
  echo -e "Run prepare-public-branch.sh first to create it"
  exit 1
fi

# Check if dev branch exists
if ! git show-ref --verify --quiet refs/heads/${DEV_BRANCH}; then
  echo -e "${RED}Error: Development branch ${DEV_BRANCH} does not exist${NC}"
  exit 1
fi

# Switch to dev branch and pull latest
echo -e "Switching to ${GREEN}${DEV_BRANCH}${NC} branch"
git checkout ${DEV_BRANCH}
echo "Pulling latest changes from origin/${DEV_BRANCH}"
git pull origin ${DEV_BRANCH}

# Switch to public branch
echo -e "Switching to ${GREEN}${PUBLIC_BRANCH}${NC} branch"
git checkout ${PUBLIC_BRANCH}

# Merge changes from dev branch
echo "Merging changes from ${DEV_BRANCH}"
git merge --no-commit ${DEV_BRANCH}

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
git commit -m "Sync with ${DEV_BRANCH} and clean up repository"

# Instructions for next steps
echo -e "\n${GREEN}Branch ${PUBLIC_BRANCH} is now synced and clean!${NC}"
echo -e "${YELLOW}To push to remote:${NC}"
echo -e "  git push -u origin ${PUBLIC_BRANCH}"
echo -e "${YELLOW}To switch back to your development branch:${NC}"
echo -e "  git checkout ${CURRENT_BRANCH}"

# Switch back to the original branch
git checkout ${CURRENT_BRANCH}
echo -e "\nSwitched back to ${GREEN}${CURRENT_BRANCH}${NC}"