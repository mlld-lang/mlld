#!/bin/bash
# Add @ prefix to variable declarations in new syntax

echo "Updating variable declarations..."

count=0

# Update variable declarations to use @ prefix
for directive in text data path exec; do
  files=$(find tests/cases examples -name "*.md" -o -name "*.mld" | xargs grep -l "^\/$directive [a-zA-Z_][a-zA-Z0-9_]* =")
  for file in $files; do
    if [ -f "$file" ]; then
      # Use perl for more reliable regex handling
      perl -i.bak -pe "s/^(\/$directive) ([a-zA-Z_][a-zA-Z0-9_]*) =/\1 @\2 =/g" "$file"
      ((count++))
    fi
  done
done

echo "Variable declaration updates complete. Modified $count files."