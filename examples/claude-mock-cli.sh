#!/usr/bin/env bash
set -euo pipefail

# Minimal mock for the Claude CLI that emits NDJSON streaming events
# Usage: CLAUDE_BIN=examples/claude-mock-cli.sh mlld examples/review-comments.mld

prompt=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--prompt)
      shift
      prompt="$1" || true
      ;;
    --output-format=*)
      # ignore
      ;;
    --verbose)
      # ignore
      ;;
  esac
  shift || true
done

echo "{\"type\":\"start\",\"level\":\"info\",\"promptPreview\":\"${prompt//\"/\\\"}\"}"
sleep 0.05
echo '{"type":"message_start","index":0}'
sleep 0.05
echo '{"type":"content_block_start","index":0}'
sleep 0.05
echo '{"type":"delta","text":"Reviewing..."}'
sleep 0.05
echo '{"type":"delta","text":" Found 2 suggestions."}'
sleep 0.05
echo '{"type":"message_delta","stop_reason":"end_turn"}'
sleep 0.02
echo '{"type":"message_stop"}'
sleep 0.02
echo '{"type":"final","summary":"done"}'
