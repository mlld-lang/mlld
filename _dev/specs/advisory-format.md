# Security Advisory Format Specification

Version: 1.0  
Last Updated: 2025-05-29

## Overview

This document specifies the format for mlld security advisories. Advisories alert users to vulnerabilities in modules and provide remediation guidance.

## Advisory Structure

```json
{
  "id": "MLLD-YYYY-NNNN",
  "title": "Brief vulnerability description",
  "severity": "critical|high|medium|low",
  "cwe": ["CWE-XXX"],
  "summary": "One-paragraph summary",
  "details": "Detailed vulnerability explanation",
  "affected": { ... },
  "patches": { ... },
  "workarounds": "Mitigation steps if no patch available",
  "references": [ ... ],
  "reporter": { ... },
  "metadata": { ... }
}
```

## Field Specifications

### id (required)
Format: `MLLD-YYYY-NNNN`
- `YYYY`: 4-digit year
- `NNNN`: 4-digit sequential number

Example: `MLLD-2024-0001`

### title (required)
Brief description, <100 characters

Examples:
- "Command injection in @alice/exec-helper"
- "Path traversal in @bob/file-utils"
- "Sensitive data logged by @charlie/logger"

### severity (required)
One of: `critical`, `high`, `medium`, `low`

#### Severity Guidelines
- **critical**: Remote code execution, complete system compromise
- **high**: Local code execution, privilege escalation, data theft
- **medium**: Information disclosure, DoS, limited impact
- **low**: Minor issues, requires significant user interaction

### cwe (optional)
Array of CWE (Common Weakness Enumeration) identifiers

Examples:
- `["CWE-78"]` - OS Command Injection
- `["CWE-22"]` - Path Traversal
- `["CWE-79", "CWE-116"]` - Multiple weaknesses

### summary (required)
One-paragraph explanation for users. Should explain:
- What the vulnerability is
- How it could be exploited
- What the impact is

Example:
```json
"summary": "The exec-helper module passes user input directly to shell commands without sanitization. An attacker could inject arbitrary commands that would execute with the privileges of the mlld script."
```

### details (required)
Complete technical explanation including:
- Root cause
- Attack vectors
- Proof of concept (if safe to disclose)
- Technical details for developers

Example:
```json
"details": "The vulnerability exists in the `runCommand` function at line 42 of exec.mld. User input from the `userCmd` variable is concatenated directly into a shell command:\n\n```mlld\n@run [bash -c \"${userCmd}\"]\n```\n\nThis allows metacharacters like `;`, `|`, and `$()` to break out of the intended command."
```

### affected (required)
Modules and versions affected by the vulnerability

Format:
```json
{
  "@user/module": {
    "versions": ["<1.2.0", ">=2.0.0 <2.1.3"],
    "hashes": ["a1b2c3d4", "e5f6g7h8"]
  }
}
```

Version formats:
- Exact: `"1.2.3"`
- Range: `">=1.0.0 <2.0.0"`
- Less than: `"<1.5.0"`
- Hash prefix: `["a1b2c3", "d4e5f6"]`

### patches (optional)
Available fixes for the vulnerability

Format:
```json
{
  "@user/module": {
    "version": "1.2.0",
    "hash": "i9j0k1l2m3n4o5p6",
    "notes": "Update sanitizes all user input"
  }
}
```

### workarounds (optional)
Steps users can take if no patch is available

Examples:
```json
"workarounds": "Sanitize all user input before passing to the module:\n\n```mlld\n@text safeCmd = {{userCmd | replace(';', '') | replace('|', '')}}\n```"
```

### references (required)
Array of relevant URLs

Examples:
```json
[
  "https://github.com/user/module/security/advisories/GHSA-xxxx",
  "https://github.com/user/module/pull/123",
  "https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2024-xxxxx"
]
```

### reporter (required)
Credit for the vulnerability discovery

Format:
```json
{
  "name": "Security Researcher",
  "email": "researcher@example.com",  // optional
  "github": "researcher",             // optional  
  "url": "https://researcher.com"     // optional
}
```

### metadata (required)
Advisory metadata and community validation

Format:
```json
{
  "created": "2024-01-15T10:00:00Z",
  "updated": "2024-01-15T12:00:00Z",
  "published": "2024-01-15T14:00:00Z",
  "withdrawn": null,
  "votes": {
    "confirm": 15,
    "dispute": 2
  },
  "tags": ["injection", "critical", "verified"]
}
```

## Complete Example

```json
{
  "id": "MLLD-2024-0001",
  "title": "Command injection in @alice/exec-helper",
  "severity": "high",
  "cwe": ["CWE-78"],
  "summary": "The exec-helper module passes user input directly to shell commands without sanitization. An attacker could inject arbitrary commands that would execute with the privileges of the mlld script.",
  "details": "The vulnerability exists in the `runCommand` function at line 42 of exec.mld. User input from the `userCmd` variable is concatenated directly into a shell command:\n\n```mlld\n@run [bash -c \"${userCmd}\"]\n```\n\nThis allows metacharacters like `;`, `|`, and `$()` to break out of the intended command. For example:\n\n```mlld\n@import { runCommand } from @alice/exec-helper\n@text userInput = \"innocent; rm -rf /\"\n@run @runCommand(@userInput)  # Executes both commands\n```",
  "affected": {
    "@alice/exec-helper": {
      "versions": ["<1.2.0"],
      "hashes": ["a1b2c3d4", "e5f6g7h8", "i9j0k1l2"]
    }
  },
  "patches": {
    "@alice/exec-helper": {
      "version": "1.2.0", 
      "hash": "m3n4o5p6q7r8s9t0",
      "notes": "Properly escapes shell metacharacters"
    }
  },
  "workarounds": "Sanitize user input before passing to runCommand:\n\n```mlld\n@text safe = {{userInput | replace(';', '') | replace('|', '')}}\n@run @runCommand(@safe)\n```",
  "references": [
    "https://github.com/alice/exec-helper/security/advisories/GHSA-1234",
    "https://github.com/alice/exec-helper/pull/45",
    "https://example.com/blog/mlld-command-injection"
  ],
  "reporter": {
    "name": "Bob Security",
    "github": "bobsec",
    "url": "https://bobsecurity.com"
  },
  "metadata": {
    "created": "2024-01-15T10:00:00Z",
    "updated": "2024-01-15T12:00:00Z", 
    "published": "2024-01-15T14:00:00Z",
    "withdrawn": null,
    "votes": {
      "confirm": 15,
      "dispute": 2
    },
    "tags": ["injection", "high-severity", "has-patch"]
  }
}
```

## Validation Rules

### Required Fields
All fields marked as required must be present and non-empty.

### ID Format
Must match pattern: `/^MLLD-\d{4}-\d{4}$/`

### Severity Values
Must be one of: `critical`, `high`, `medium`, `low`

### Timestamps
Must be valid ISO 8601 format: `YYYY-MM-DDTHH:mm:ssZ`

### Version Strings
Must be valid semver ranges or exact versions

### URLs
Must be valid HTTPS URLs (or HTTP for localhost)

## Submission Process

### 1. Create Advisory
Create JSON file following this specification

### 2. Validate
Run validation tool:
```bash
mlld advisory validate advisory.json
```

### 3. Submit PR
Submit to `mlld-lang/advisories` repository

### 4. Review Period
72-hour community review period

### 5. Publication
Merged and distributed after approval

## Distribution

### Primary Storage
GitHub repository: `mlld-lang/advisories/advisories/YYYY/MLLD-YYYY-NNNN.json`

### Index File
Aggregated index for efficient lookup:
```json
{
  "advisories": [
    {
      "id": "MLLD-2024-0001",
      "module": "@alice/exec-helper",
      "severity": "high",
      "published": "2024-01-15T14:00:00Z"
    }
  ]
}
```

### Local Cache
Stored at: `~/.mlld/advisories/`

## Future Extensions

- Signatures for authenticity
- CVSS scoring
- Automated patch generation
- Multi-language descriptions
- Remediation verification