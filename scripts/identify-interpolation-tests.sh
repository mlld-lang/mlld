#!/bin/bash
# Identify tests that need manual review for string interpolation changes

echo "Identifying tests with string interpolation that need review..."

# Create output file
output="string-interpolation-review.txt"
echo "Tests requiring manual review for string interpolation:" > "$output"
echo "Double quotes now interpolate @variables - review expected behavior" >> "$output"
echo "" >> "$output"

# Find files with @ inside double quotes
echo "=== Files with @variable inside double quotes ===" >> "$output"
grep -r '"[^"]*@[a-zA-Z_][a-zA-Z0-9_]*[^"]*"' tests/cases --include="*.md" | cut -d: -f1 | sort -u >> "$output"

echo "" >> "$output"
echo "=== Data tests with string values (may need single quotes) ===" >> "$output"
grep -r '@data.*{.*"[^"]*"' tests/cases/valid/data --include="*.md" | cut -d: -f1 | sort -u >> "$output"

echo "" >> "$output"
echo "=== Path tests with @ in paths ===" >> "$output"
grep -r '@path.*"[^"]*@' tests/cases/valid/path --include="*.md" | cut -d: -f1 | sort -u >> "$output"

echo "" >> "$output"
echo "=== Import tests with @ in paths ===" >> "$output"
grep -r 'from "[^"]*@' tests/cases/valid/import --include="*.md" | cut -d: -f1 | sort -u >> "$output"

# Count total files
total=$(grep -v "^===" "$output" | grep -v "^Tests" | grep -v "^Double" | grep -v "^$" | sort -u | wc -l)

echo ""
echo "Found $total test files that need manual interpolation review"
echo "Review list saved to: $output"