# Meld: Modular Prompt Scripting

## What is Meld?

Meld (`.mld`) is a prompt scripting language embedded in Markdown that enables dynamic content generation, modular prompt engineering, and seamless integration with command-line tools. Think of it as "executable documentation" - your markdown files can now fetch data, run commands, build dynamic prompts, and compose content from multiple sources.

## Why Meld?

We need better ways to:
- Build complex, reusable prompts from modular components
- Combine static documentation with dynamic data
- Chain multiple LLM calls together
- Version control and share prompt engineering workflows
- Structure content in LLM-friendly formats

Meld solves these problems by treating markdown files as programmable modules.

## Core Concepts

### 1. Everything is Markdown

Meld enhances regular markdown - anything that isn't a directive (starting with `@`) is treated as normal markdown:

```meld
# My Document

This is regular markdown.

@text greeting = "Hello from Meld!"

The greeting is still markdown, but now we can make it dynamic.

@add @greeting
```

### 2. Directives Execute Line by Line

Meld processes directives sequentially, building up state as it goes:

```meld
@text name = "Alice"
@text role = "software engineer"
@data context = {
  "project": "AI Assistant",
  "language": "Python"
}

@text prompt = [[
You are helping {{name}}, a {{role}}, working on {{context.project}} using {{context.language}}.
]]

@add @prompt
```

### 3. Only @add and @run Produce Output

This is crucial - most directives just set up state. Only `@add` and `@run` actually contribute to the final document:

```meld
@text hidden = "This won't appear in output"
@data config = { "debug": true }

@add [[This WILL appear in output]]
@run [echo "This command output WILL appear"]
```

## Modular Prompt Engineering

### Building Prompt Libraries

Create reusable prompt components in separate files:

**prompts/roles.mld:**
```meld
@text architect = "You are a senior software architect with 20 years of experience."
@text reviewer = "You are a thorough code reviewer focused on security and performance."
@text teacher = "You are a patient teacher who explains complex concepts simply."
```

**prompts/tasks.mld:**
```meld
@text analyze_code = "Analyze this code for potential issues and suggest improvements."
@text explain_concept = "Explain this concept as if teaching a junior developer."
@text review_pr = "Review this pull request for merge readiness."
```

### Composing Complex Prompts

Import and combine modules to build sophisticated prompts:

```meld
@import { architect, reviewer } from "prompts/roles.mld"
@import { analyze_code } from "prompts/tasks.mld"

@text codebase = @run [find src -name "*.py" -exec cat {} \;]
@text recent_changes = @run [git diff main..HEAD]

@text full_prompt = [[
{{architect}}

Here's our codebase:
```python
{{codebase}}
```

Recent changes:
```diff
{{recent_changes}}
```

{{analyze_code}}
]]

@run [claude --message @full_prompt]
```

## Flow Control Through External Tools

Meld doesn't have built-in conditionals or loops - instead, it leverages the full power of your system's tools:

### Using Shell Scripts

```meld
@text files = @run [find . -name "*.test.js" | head -5]
@text test_results = @run [npm test 2>&1]

@text status = @run [bash -c '
  if echo "@test_results" | grep -q "FAILED"; then
    echo "❌ Tests failing"
  else
    echo "✅ All tests passing"
  fi
']

## Test Report
{{status}}

### Test Files Checked:
{{files}}
```

### Using Python for Data Processing

```meld
@data users = [
  {"name": "Alice", "score": 85},
  {"name": "Bob", "score": 92},
  {"name": "Charlie", "score": 78}
]

@text analysis = @run python -c '
import json
users = json.loads("""@users""")
avg_score = sum(u["score"] for u in users) / len(users)
top_user = max(users, key=lambda u: u["score"])
print(f"Average score: {avg_score:.1f}")
print(f"Top performer: {top_user["name"]} ({top_user["score"]})")
'

@add @analysis
```

### Using JavaScript for Complex Logic

```meld
@text markdown_content = @run [cat README.md]

@text toc = @run [node -e '
const content = `@markdown_content`;
const headers = content.match(/^#{1,3} .+$/gm) || [];
const toc = headers.map(h => {
  const level = h.match(/^#+/)[0].length;
  const text = h.replace(/^#+\s+/, "");
  const indent = "  ".repeat(level - 1);
  return `${indent}- ${text}`;
}).join("\n");
console.log(toc);
']

## Table of Contents
@add @toc
```

## LLM Integration Patterns

### Sequential Prompt Chaining

```meld
@text code = @run [cat src/main.py]

>> First, get a code review
@text review = @run [claude --message "Review this Python code for issues:\n\n@code"]

>> Then, get specific fixes
@text fixes = @run [claude --message "Based on this review:\n@review\n\nProvide specific code fixes."]

>> Finally, get a summary
@text summary = @run [claude --message "Summarize these fixes in 3 bullet points:\n@fixes"]

## Code Review Summary
@add @summary

### Detailed Review
@add @review

### Suggested Fixes
@add @fixes
```

### Parallel Analysis

```meld
@text content = @run [cat proposal.md]

>> Get multiple perspectives simultaneously
@text tech_review = @run [claude --system "You are a technical architect" \
  --message "Review this proposal:\n@content"]

@text business_review = @run [claude --system "You are a business analyst" \
  --message "Review this proposal:\n@content"]

@text security_review = @run [claude --system "You are a security expert" \
  --message "Review this proposal:\n@content"]

## Proposal Reviews

### Technical Perspective
@add @tech_review

### Business Perspective
@add @business_review

### Security Perspective
@add @security_review
```

## LLM-Friendly XML Output

Meld has a built-in XML output format that converts markdown hierarchy into simple, non-strict XML - perfect for structured prompts:

```meld
# Document
This is a doc
## Header
Some content
### Subhead
Content
### Other subhead
More content
## Another Header
Content
### Subhead
Some more content
#### Sub subhead
Some content again
```

When processed with `mlld --format xml file.mld`, this becomes:

```xml
<DOCUMENT>
This is a doc
<HEADER>
Some content
<SUBHEAD>
Content
</SUBHEAD>
<OTHER_SUBHEAD>
More content
</OTHER_SUBHEAD>
</HEADER>
<ANOTHER_HEADER>
Content
<SUBHEAD>
Some more content
<SUB_SUBHEAD>
Some content again
</SUB_SUBHEAD>
</SUBHEAD>
</ANOTHER_HEADER>
</DOCUMENT>
```

This XML format:
- Uses SCREAMING_SNAKE_CASE for maximum clarity
- Preserves markdown hierarchy as nested XML elements
- Is non-strict (no schema validation) for flexibility
- Works perfectly with LLMs that understand structured data

### Example: Structured Knowledge Base

```meld
# Product Documentation
@text version = @run [cat VERSION]
Version: @add @version

## Features
### Authentication
- OAuth 2.0 support
- Multi-factor authentication
- Session management

### API
- RESTful endpoints
- GraphQL support
- WebSocket connections

## Troubleshooting
### Common Issues
#### Login Failures
Check authentication tokens
#### API Timeouts
Verify rate limits
```

This structured documentation becomes perfectly parseable XML that LLMs can navigate and query effectively.

## Module System: Public Registry & Private Resolvers

Meld has a decentralized module system supporting both public sharing and private/corporate modules.

### Public Module Registry

Import modules from the public registry using `@user/module` syntax:

```meld
@import { senior_reviewer, code_analyst } from @prompts/roles
@import { coding_standards } from @company/standards
@import { pr_template } from @templates/github

@text current_pr = @run [gh pr view --json body -q .body]

@text review_prompt = [[
{{senior_reviewer}}

Our coding standards:
{{coding_standards}}

Please review this PR:
{{current_pr}}
]]
```

**How it works:**
- DNS TXT records map `@user/module` to GitHub gists
- Content is cached locally and identified by SHA-256 hash
- No central servers - fully decentralized
- Lock files ensure reproducible builds

### Private Module Resolvers

Configure custom resolvers for private or corporate modules in your lock file:

```json
{
  "registries": [
    {
      "prefix": "@notes/",
      "resolver": "local",
      "config": { "path": "~/Documents/Notes" }
    },
    {
      "prefix": "@company/", 
      "resolver": "github",
      "config": {
        "owner": "company",
        "repo": "mlld-modules",
        "token": "${GITHUB_TOKEN}"
      }
    },
    {
      "prefix": "@api/",
      "resolver": "http", 
      "config": {
        "baseUrl": "https://internal.company.com/modules",
        "headers": { "Authorization": "Bearer ${API_TOKEN}" }
      }
    }
  ]
}
```

Then import from your configured namespaces:

```meld
>> Local filesystem modules
@import { daily_standup } from @notes/meetings
@import { project_context } from @notes/projects/current

>> Private GitHub repository
@import { internal_apis } from @company/documentation
@import { security_checklist } from @company/compliance

>> Custom HTTP endpoint
@import { live_data } from @api/dashboard
```

### Security & Trust

Control security with trust levels and TTL:

```meld
>> Always trust company modules
@import { deploy } from @company/tools trust always

>> Verify external modules on first use
@import { parser } from @community/utils trust verify

>> Refresh live data every 30 minutes
@import { metrics } from @api/monitoring (30m) trust always

>> Never trust certain sources
@import { example } from @untrusted/demo trust never
```

### Direct URL Support

Still support direct URL imports when needed:

```meld
@import { * } from "https://example.com/prompts/standard-roles.mld"
@import { coding_standards } from "https://example.com/docs/standards.mld"
```

### Fetching Documentation

```meld
@text api_docs = [https://api.example.com/docs/latest.md]
@text changelog = "## Recent Changes" from [https://example.com/CHANGELOG.md]

## API Integration Guide

@add @changelog

### Full API Documentation
@add @api_docs
```

## Practical Examples

### Dynamic README Generation

```meld
@text version = @run [npm version --json | jq -r .version]
@text contributors = @run [git shortlog -sn | head -10]
@text last_commit = @run [git log -1 --pretty=format:"%h - %s (%cr)"]
@text test_badge = @run [
  if npm test >/dev/null 2>&1; then 
    echo "![Tests](https://img.shields.io/badge/tests-passing-green)"
  else 
    echo "![Tests](https://img.shields.io/badge/tests-failing-red)"
  fi
]

# My Project v{{version}}

{{test_badge}}

Last commit: {{last_commit}}

## Contributors
```
{{contributors}}
```
```

### Automated PR Description

```meld
@text branch = @run [git branch --show-current]
@text changes = @run [git diff main..HEAD --stat]
@text commits = @run [git log main..HEAD --oneline]

>> Analyze the changes
@text analysis = @run [claude --message "Analyze these code changes and write a brief summary:\n\n@changes\n\nCommits:\n@commits"]

## Pull Request: {{branch}}

### Summary
{{analysis}}

### Changes
```
{{changes}}
```

### Commits
```
{{commits}}
```
```

### Multi-Model Consensus

```meld
@text question = "What are the key considerations for migrating from REST to GraphQL?"

>> Get responses from multiple models
@text claude_response = @run [claude --message @question]
@text gpt_response = @run [openai --message @question]
@text local_response = @run [ollama run llama2 @question]

>> Synthesize the responses
@text synthesis = @run [claude --message "
Synthesize these three responses into a unified answer:

Response 1: @claude_response
Response 2: @gpt_response  
Response 3: @local_response

Create a consensus view that incorporates the best insights from each.
"]

## Migration Guide: REST to GraphQL

{{synthesis}}

### Individual Model Responses

<details>
<summary>Claude's Response</summary>
{{claude_response}}
</details>

<details>
<summary>GPT's Response</summary>
{{gpt_response}}
</details>

<details>
<summary>Llama's Response</summary>
{{local_response}}
</details>
```

## Best Practices

1. **Keep Prompts Modular** - Store reusable components in separate `.mld` files
2. **Version Control Everything** - Meld files are plain text, perfect for git
3. **Use Templates for Complex Prompts** - The `[[...]]` syntax keeps things readable
4. **Leverage System Tools** - Don't reinvent the wheel, use grep, jq, python, etc.
5. **Document Your Modules** - Remember, it's still markdown!

## Getting Started

1. Install Meld: `npm install -g mlld`
2. Create a file `hello.mld`:
   ```meld
   @text name = @run [whoami]
   # Hello, {{name}}!
   
   Welcome to Meld. The current date is:
   @run [date]
   ```
3. Run it: `mlld hello.mld`
4. See the output in `hello.o.md`

## Conclusion

Meld bridges the gap between static documentation and dynamic content generation. By embedding a simple scripting language in markdown, it enables powerful workflows for prompt engineering, documentation automation, and AI-assisted content creation - all while keeping your files readable, versioned, and modular.
