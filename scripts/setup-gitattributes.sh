#!/bin/bash

# Script to create a .gitattributes file for consistent line endings and binary file handling

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Setting up .gitattributes for the repository${NC}"

# Check if we're in a git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo -e "${RED}Error: Not in a git repository${NC}"
  exit 1
fi

# Check if .gitattributes already exists
if [ -f ".gitattributes" ]; then
  echo -e "${YELLOW}.gitattributes already exists. Do you want to overwrite it? (y/N)${NC}"
  read -r answer
  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    echo "Aborting."
    exit 0
  fi
fi

# Create .gitattributes file
cat > .gitattributes << 'EOF'
# Set default behavior to automatically normalize line endings
* text=auto

# Force batch scripts to use CRLF line endings
*.{cmd,[cC][mM][dD]} text eol=crlf
*.{bat,[bB][aA][tT]} text eol=crlf

# Force bash scripts to use LF line endings
*.sh text eol=lf

# Denote all files that are truly binary and should not be modified
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.mov binary
*.mp4 binary
*.mp3 binary
*.flv binary
*.fla binary
*.swf binary
*.gz binary
*.zip binary
*.7z binary
*.ttf binary
*.eot binary
*.woff binary
*.woff2 binary
*.pyc binary
*.pdf binary

# Source code
*.ts text
*.tsx text
*.js text
*.jsx text
*.json text
*.html text
*.css text
*.scss text
*.less text
*.md text
*.meld text

# Documentation
*.md text
*.txt text
LICENSE text
*.yml text
*.yaml text
*.xml text
EOF

echo -e "${GREEN}.gitattributes file created successfully!${NC}"
echo -e "${YELLOW}Do you want to commit this file now? (y/N)${NC}"
read -r answer
if [[ "$answer" == "y" || "$answer" == "Y" ]]; then
  git add .gitattributes
  git commit -m "Add .gitattributes for consistent line endings"
  echo -e "${GREEN}.gitattributes committed!${NC}"
else
  echo -e "${YELLOW}File created but not committed. You can commit it later.${NC}"
fi