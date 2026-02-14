#!/usr/bin/env bash
# Nudge agents toward mlld skills when writing to llm/
# Reads PostToolUse JSON from stdin, checks file_path

set -euo pipefail

INPUT=$(cat)

# Extract file_path from tool_input using jq or fallback
if command -v jq >/dev/null 2>&1; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)
else
  FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
fi

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Check if path contains /llm/ or starts with llm/
case "$FILE_PATH" in
  llm/*|*/llm/*)
    echo "mlld skills: /mlld:orchestrator, /mlld:agents | examples: plugins/mlld/examples/"
    ;;
esac
