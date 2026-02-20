## Evidence Requirements

Every claim MUST have direct evidence. No exceptions.

### Required Evidence Format

| Claim Type | Required Evidence |
|-----------|------------------|
| "Code is missing X" | Show grep/glob search that found no results + explain what should exist |
| "Code does X wrong" | Show the specific code (file:line) + explain expected vs actual behavior |
| "Test doesn't cover X" | Show the test file content + identify the missing scenario with specifics |
| "Doc says X but code does Y" | Quote the doc passage + show the contradicting code (file:line) |
| "Feature doesn't work" | Show exact command run + exact output + explain the failure |

### Severity Classification

- **critical**: Feature doesn't work at all, data loss risk, security vulnerability
- **high**: Feature works but incorrectly in important cases, missing core spec functionality
- **medium**: Edge case failures, incomplete coverage, misleading documentation
- **low**: Minor inaccuracies, style issues, non-blocking gaps

### Rules

1. No speculation. "Probably broken" is INVALID.
2. No substitution. Test the actual mechanism described, not an alternative.
3. Evidence must be reproducible. Another person running your commands should see the same result.
4. Cite specific file paths and line numbers for code claims.
5. Quote specific passages for documentation claims.
6. Default to "deficiency found" when uncertain. False negatives are worse than false positives.
7. Every finding must be independently verifiable by a different reviewer.
