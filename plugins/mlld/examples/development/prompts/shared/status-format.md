## Return Status

Write a JSON object reporting what you did:

```json
{
  "status": "completed|partial|blocked",
  "work_done": {
    "description": "Brief summary of what you did",
    "files_written": ["path/to/file.ts"],
    "commit_hash": "<short hash>",
    "commit_message": "Descriptive commit message"
  },
  "standup": {
    "progress": "What was accomplished",
    "blockers": "What's blocking (if any)",
    "next": "What should happen next"
  }
}
```