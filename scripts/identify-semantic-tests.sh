#!/bin/bash
# Identify tests that use [...] for content loading (semantic preservation)

echo "Identifying tests with semantic bracket usage..."

output="semantic-preservation-review.txt"
echo "Tests using [...] for content loading - DO NOT change to {...}:" > "$output"
echo "" >> "$output"

# Find /add with [file] patterns
echo "=== /add directives loading file content ===" >> "$output"
grep -r '^/add \[[^([]' tests/cases/valid/add --include="*.md" | grep -v '\[\[' >> "$output"

echo "" >> "$output"
echo "=== /text assignments loading content ===" >> "$output"
grep -r '^/text.*= \[[^([]' tests/cases/valid/text --include="*.md" | grep -v '\[\[' >> "$output"

echo "" >> "$output"
echo "=== Other directives using [...] for content ===" >> "$output"
grep -r '= \[[^([]' tests/cases/valid --include="*.md" | grep -v '\[\[' | grep -v '^/text' >> "$output"

# Count instances
total=$(grep -v "^===" "$output" | grep -v "^Tests" | grep -v "^$" | wc -l)

echo ""
echo "Found $total instances of semantic bracket usage"
echo "Review list saved to: $output"
echo "CRITICAL: These [...] brackets load content and must NOT be changed!"