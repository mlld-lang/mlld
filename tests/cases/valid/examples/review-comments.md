"Streaming Code Review Comments (Claude Code CLI)"

/desc
  Demonstrates streaming the Claude Code CLI’s JSON output through mlld.
  Enable streaming to see events as they arrive.
  
  Requirements:
  - Claude Code CLI installed and authenticated (`claude --help` should work)
  - Optionally set PROMPT to customize the review focus
  
  Usage:
    MLLD_STREAM=full mlld examples/review-comments.mld
    MLLD_STREAM=progress mlld examples/review-comments.mld
    PROMPT="Review this diff for security issues" \
    MLLD_STREAM=full mlld examples/review-comments.mld

# Simple wrapper around the Claude Code CLI that requests streaming JSON
/exe @claude(prompt) = { ${CLAUDE_BIN:-claude} -p "@prompt" --output-format=stream-json --verbose }

/show "Starting streaming code review…"

# Invoke the streaming CLI; with MLLD_STREAM=full you’ll see NDJSON live
/run @claude("Review the following code and propose actionable, line-anchored comments.")

/show "Review complete."
