#!/bin/bash
# Update command brackets [()] -> {} 
# REQUIRES MANUAL VERIFICATION - some [...] must be preserved!

echo "Updating command brackets..."
echo "WARNING: This script requires manual verification!"
echo "Some [...] brackets are for file/content loading and must NOT be changed!"

count=0

# Create a review file
echo "Files that need manual review for bracket updates:" > command-bracket-review.txt

# Update /run command brackets
files=$(find tests/cases examples -name "*.md" -o -name "*.mld" | xargs grep -l '\\\[(' 2>/dev/null || true)
for file in $files; do
  if [ -f "$file" ]; then
    # Check if file contains potential command brackets
    if grep -q '\/run \[\(' "$file" || grep -q '= \[\(' "$file"; then
      echo "$file" >> command-bracket-review.txt
      
      # Update obvious command patterns
      perl -i.bak -pe 's/\/run \[\((.*?)\)\]/\/run {\1}/g' "$file"
      
      # Update exec definitions
      perl -i.bak -pe 's/= \[\((.*?)\)\]$/= {\1}/g' "$file"
      
      ((count++))
    fi
  fi
done

echo "Command bracket updates complete. Modified $count files."
echo "IMPORTANT: Review files listed in command-bracket-review.txt"
echo "Verify that [...] for file/content loading was NOT changed to {...}"