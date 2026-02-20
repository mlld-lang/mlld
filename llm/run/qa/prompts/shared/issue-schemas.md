## Issue Categories

| Category | Description |
|----------|-------------|
| `broken-promise` | Docs say X, behavior is Y |
| `unclear-error` | Error message doesn't help diagnose the problem |
| `unclear-docs` | Missing information or confusing explanation |
| `friction` | Works but feels wrong or unexpected |

## Severity Levels

| Severity | Description |
|----------|-------------|
| `major` | Feature doesn't work as documented AND no workaround found after 3+ approaches. Must point to specific doc statement that's contradicted. |
| `minor` | Feature works but docs could be clearer, or workaround was non-obvious but found. |
| `enhancement` | Not a bug, improvement idea |

**Note:** There is no `blocker` severity in Phase 1. Use `major` for the most severe issues. Phase 2 (self-review) may upgrade confirmed issues to `blocker` after verifying them against test cases and source code. In Phase 1, you don't have enough information to confidently distinguish "genuinely impossible" from "I haven't found the right approach yet."

## Results Schema

Each experiment MUST produce a `results.json`:

```json
{
  "experiment": "01-L-basic-usage",
  "topic": "<topic>",
  "status": "pass|fail|partial",
  "summary": "One-line description of outcome",
  "what_works": ["List of things that worked correctly (even in failed experiments)"],
  "issues": [
    {
      "category": "broken-promise|unclear-error|unclear-docs|friction",
      "severity": "major|minor|enhancement",
      "title": "Brief issue description",
      "input": "What you tried (code or command)",
      "expected": "What should have happened",
      "actual": "What actually happened",
      "workaround": "How to work around this issue (if known)",
      "recommendation": "Suggested fix",
      "related_experiments": ["Other experiment names with same/related issue"]
    }
  ],
  "context": {
    "purpose": "Why this experiment was created",
    "builds_on": "Previous experiment this extends (if any)",
    "blocks": "What this issue prevents testing (if blocker)"
  }
}
```

**Field notes:**
- `what_works`: Capture positive findings even when status is fail/partial
- `workaround`: Help users work around issues until fixed
- `related_experiments`: Link issues that share root causes
- `context.blocks`: For major issues, explain what M/H tests this prevents
