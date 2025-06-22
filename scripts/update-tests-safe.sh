#!/bin/bash
# Safe automated updates for mlld test syntax migration
# These updates don't affect semantic meaning

echo "Starting safe syntax updates..."

# Create backup directory
mkdir -p .syntax-backup
cp -r tests/cases .syntax-backup/
cp -r examples .syntax-backup/

# Counter for changes
count=0

# Update directive markers @ -> /
echo "Updating directive markers..."
for directive in text run add import data exec path output when; do
  files=$(find tests/cases examples -name "*.md" -o -name "*.mld" | xargs grep -l "^@$directive")
  for file in $files; do
    if [ -f "$file" ]; then
      sed -i.bak "s/^@$directive/\/$directive/g" "$file"
      ((count++))
    fi
  done
done

# Update comments >> -> //
echo "Updating comments..."
files=$(find tests/cases examples -name "*.md" -o -name "*.mld" | xargs grep -l "^>>")
for file in $files; do
  if [ -f "$file" ]; then
    sed -i.bak 's/^>>/\/\//g' "$file"
    ((count++))
  fi
done

echo "Safe updates complete. Modified $count files."
echo "Backup files created with .bak extension"