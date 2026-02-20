### Return status
Write JSON reporting what you did (file content already saved, don't include it):

```json
{
  "status": "completed|partial|blocked|needs_human",

  "work_done": {
    "description": "Brief summary of what you did",
    "files_written": ["path/to/file.ts"],
    "commit_hash": "<short hash from git rev-parse --short HEAD>",
    "commit_message": "Descriptive commit message"
  },

  "friction_points": [
    {
      "type": "unclear_error|missing_feature|doc_gap|design_question|test_failure",
      "description": "What's blocking or concerning",
      "urgency": "high|med|low",
      "suggested_fix": "How to address it",
      "file": "src/path/to/file.ts",
      "line": 142,
      "evidence": "REQUIRED - exact error, test output, or reproduction steps",
      "chestertons_fence": {
        "current_behavior": "What currently happens",
        "possible_reason": "Why it might be intentional",
        "change_impact": "What would change if we fix this"
      }
    }
  ],

  "standup": {
    "progress": "What was accomplished",
    "blockers": "What's blocking (if any)",
    "next": "What should happen next"
  }
}
```