# mlld Overview Guide

## What is mlld?

mlld (`.mld`) is a scripting language designed for working with Large Language Models (LLMs) and generating dynamic content. It provides a simple syntax for orchestrating AI interactions, processing data, and producing markdown output.

## Design Principles

mlld is built around several key principles:
- Provide clear context and specific instructions to LLMs
- Support text-based workflows and transformations
- Enable structured processing through pipelines
- Route data and actions based on logical conditions
- Keep the core language simple while allowing extension through modules

## Why mlld?

Traditional programming languages force you to think in terms of loops, exceptions, and types. But working with LLMs is different - it's more like:
- Consulting multiple experts for different perspectives
- Refining outputs through stages of review
- Building institutional knowledge into reusable workflows
- Creating "pipeline of thought" rather than just "chain of thought"

mlld provides exactly the primitives you need for this new paradigm, and nothing more.

## Core Philosophy: Simple Core, Extensible Modules

mlld maintains a minimal core language for orchestration while supporting extensibility through modules:

- **Simple syntax**: Limited set of directives to learn
- **Module system**: JavaScript/TypeScript modules for complex functionality
- **Readable scripts**: Focus on clarity and maintainability
- **LLM integration**: Built-in support for AI workflows

## Core Concepts

### 1. Everything is Markdown

mlld enhances regular markdown - anything that isn't a directive (starting with `/`) is treated as normal markdown:

```mlld
# My Document

This is regular markdown.

/var @greeting = "Hello from mlld!"

The greeting is still markdown, but now we can make it dynamic.

/show @greeting
```

### 2. Directives Execute Line by Line

Meld processes directives sequentially, building up state as it goes:

```mlld
/var @name = "Alice"
/var @role = "software engineer"
/var @context = {
  "project": "AI Assistant",
  "language": "Python"
}

/var @prompt = ::
You are helping {{name}}, a {{role}}, working on {{context.project}} using {{context.language}}.
::

/show @prompt
```

### 3. Only /show and /run Produce Output

This is crucial - most directives just set up state. Only `/show` and `/run` actually contribute to the final document:

```mlld
/var @hidden = "This won't appear in output"
/var @config = { "debug": true }

/show ::This WILL appear in output::
/run "echo This command output WILL appear"
```

### 4. Complexity Lives in Modules

When you need loops, error handling, or complex algorithms, modules provide these capabilities:

```mlld
# Instead of language features, use modules:
/import { forEach, parallel, retry } from @mlld/core
/import { validateResponse, improveAnswer } from @company/ai-tools

# Orchestrate with simple, readable syntax:
/var @results = /run @parallel(@llmCalls, { concurrency: 3 })
/var @refined = /run @validateResponse(@results) 
```

This separation keeps mlld scripts clean and focused on orchestration while modules handle implementation details.

### 5. Logical Routing with Operators

mlld can route data and actions based on conditions using built-in operators:

```mlld
# Use operators in expressions
/var @canProcess = @status == "ready" && !@isLocked
/var @priority = @severity > 8 ? "high" : "normal"

# Route actions based on conditions
/when first [
  @method == "GET" && @path == "/api/users" => @listUsers()
  @method == "POST" && @path == "/api/users" => @createUser()
  @method == "DELETE" => @deleteResource()
]

# Conditional value assignment
/var @config = when [
  @env == "prod" => @prodSettings
  @env == "staging" => @stagingSettings
  none => @devSettings
]
```

This allows mlld to function as a logical router, making decisions based on runtime conditions without programming constructs.

## Modular Prompt Engineering

### Building Prompt Libraries

Create reusable prompt components in separate files:

**prompts/roles.mld:**
```mlld
/var @architect = "You are a senior software architect with 20 years of experience."
/var @reviewer = "You are a thorough code reviewer focused on security and performance."
/var @teacher = "You are a patient teacher who explains complex concepts simply."
```

**prompts/tasks.mld:**
```mlld
/var @analyze_code = "Analyze this code for potential issues and suggest improvements."
/var @explain_concept = "Explain this concept as if teaching a junior developer."
/var @review_pr = "Review this pull request for merge readiness."
```

### Composing Complex Prompts

Import and combine modules to build sophisticated prompts:

```mlld
/import { architect, reviewer } from "./prompts/roles.mld"
/import { analyze_code } from "./prompts/tasks.mld"

/var @codebase = /run "find src -name '*.py' -exec cat {} \;"
/var @recent_changes = /run "git diff main..HEAD"

/var @full_prompt = ::
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
::

/run "claude --message '@full_prompt'"
```

## The Power of Modules

mlld's true power comes from modules that encapsulate complex operations while keeping your scripts simple:

### Example: Document Generation Module

```javascript
// @mlld/docgen module
export async function generateDocs(config) {
  const { dirs, template, format } = config;
  const results = [];
  
  for (const dir of dirs) {
    const files = await scanDirectory(dir);
    const analysis = await analyzeCode(files);
    const doc = await template({ dir, files, analysis });
    results.push({ dir, doc });
  }
  
  return format === 'summary' ? summarize(results) : results;
}
```

Used in mlld:
```mlld
@import { generateDocs } from @mlld/docgen

@text docs = @run @generateDocs({
  dirs: ["src", "lib", "api"],
  template: @techWriterPrompt,
  format: "summary"
})

@add @docs
```

### Example: Multi-Model Consensus Module

```javascript
// @company/ai-consensus module  
export async function getConsensus(question, options = {}) {
  const { models = ['claude', 'gpt-4'], synthesizer = 'claude' } = options;
  
  // Get responses in parallel
  const responses = await Promise.all(
    models.map(model => callModel(model, question))
  );
  
  // Synthesize into consensus
  const synthesis = await callModel(synthesizer, {
    task: "Synthesize these responses into a unified answer",
    responses
  });
  
  return { synthesis, individual: responses };
}
```

Used in mlld:
```mlld
@import { getConsensus } from @company/ai-consensus

@text answer = @run @getConsensus("What are the risks of this approach?", {
  models: ["claude-3", "gpt-4", "gemini-pro"],
  synthesizer: "claude-3"
})

@add @answer.synthesis
```

### Module Benefits

1. **Testable** - Standard testing frameworks
2. **Reusable** - Share across projects
3. **Typed** - TypeScript support available
4. **Documented** - Support for documentation
5. **Versioned** - Compatible with npm versioning

## LLM Integration Patterns

### Structured Processing with Pipelines

mlld supports explicit step-by-step processing through transformation pipelines:

```mlld
# Define transformation stages
@exec checkAccuracy(response) = @run @claude(::Review this response for factual accuracy: {{response}}::)

@exec improveClarity(response) = @run @claude(::Rewrite this for clarity, preserving all facts: {{response}}::)

@exec addExamples(response) = @run @claude(::Add concrete examples to illustrate points: {{response}}::)

# Apply pipeline to ensure quality
@text answer = @run @claude("Explain how DNS works") with {
  pipeline: [@checkAccuracy, @improveClarity, @addExamples]
}

@add @answer
```

### Encoding Standards in Pipelines

Organizations can create reusable pipelines that reflect their standards:

```mlld
@import { 
  ensureInclusiveLanguage,
  checkBrandVoice,
  validateCompliance,
  addContextLinks 
} from @company/content-standards

@text response = @run @claude(@customerQuery) with {
  pipeline: [
    @ensureInclusiveLanguage,
    @checkBrandVoice,
    @validateCompliance,
    @addContextLinks
  ]
}
```

### Multi-Perspective Analysis

Use `@map` to gather diverse viewpoints efficiently:

```mlld
@data perspectives = [
  { role: "security expert", focus: "vulnerabilities and risks" },
  { role: "performance engineer", focus: "scalability and efficiency" },
  { role: "user advocate", focus: "usability and accessibility" }
]

@exec analyze(perspective) = run [(claude --system "You are a {{perspective.role}}" --message "Review this design focusing on {{perspective.focus}}: {{design}}")]

@data reviews = @map @analyze(@perspectives)

# Synthesize all perspectives
@text synthesis = @run @claude(::Synthesize these reviews into actionable recommendations: {{reviews}}::)

@add @synthesis
```

## LLM-Friendly XML Output

Meld has a built-in XML output format that converts markdown hierarchy into simple, non-strict XML - perfect for structured prompts:

```mlld
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

```mlld
# Product Documentation
@text version = run [(cat VERSION)]
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

```mlld
@import { senior_reviewer, code_analyst } from @prompts/roles
@import { coding_standards } from @company/standards
@import { pr_template } from @templates/github

@text current_pr = run [(gh pr view --json body -q .body)]

@text review_prompt = ::
{{senior_reviewer}}

Our coding standards:
{{coding_standards}}

Please review this PR:
{{current_pr}}
::
```

**How it works:**
- Registry records map `@user/module` to GitHub gists and private modules
- Content is cached locally and identified by SHA-256 hash
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

```mlld
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

```mlld
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

```mlld
@import { * } from "https://example.com/prompts/standard-roles.mld"
@import { coding_standards } from "https://example.com/docs/standards.mld"
```

### Fetching Documentation

```mlld
@text api_docs = [https://api.example.com/docs/latest.md]
@text changelog = "## Recent Changes" from [https://example.com/CHANGELOG.md]

## API Integration Guide

@add @changelog

### Full API Documentation
@add @api_docs
```

## Practical Examples

### Dynamic README Generation

```mlld
@text version = run [(npm version --json | jq -r .version)]
@text contributors = run [(git shortlog -sn | head -10)]
@text last_commit = run [(git log -1 --pretty=format:"%h - %s (%cr)")]
@text test_badge = run [(
  if npm test >/dev/null 2>&1; then 
    echo "![Tests)](https://img.shields.io/badge/tests-passing-green)"
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

```mlld
@text branch = run [(git branch --show-current)]
@text changes = run [(git diff main..HEAD --stat)]
@text commits = run [(git log main..HEAD --oneline)]

>> Analyze the changes
@text analysis = run [(claude --message "Analyze these code changes and write a brief summary:\n\n@changes\n\nCommits:\n@commits")]

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

```mlld
@text question = "What are the key considerations for migrating from REST to GraphQL?"

>> Get responses from multiple models
@text claude_response = run [(claude --message @question)]
@text gpt_response = run [(openai --message @question)]
@text local_response = run [(ollama run llama2 @question)]

>> Synthesize the responses
@text synthesis = run [(claude --message "
Synthesize these three responses into a unified answer:

Response 1: @claude_response
Response 2: @gpt_response  
Response 3: @local_response

Create a consensus view that incorporates the best insights from each.
")]

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

1. **Think Orchestration, Not Programming** - mlld scripts should describe what to do, not how
2. **Build Institutional Knowledge** - Encode standards and values into pipeline modules
3. **Embrace Probabilistic Outputs** - Use pipelines to guide, not control
4. **Keep Core Scripts Simple** - Complex logic belongs in modules
5. **Test at the Right Level** - Test modules with unit tests, test orchestration with examples
6. **Version Everything** - Both scripts and modules should be in version control
7. **Document Intent** - Your .mld files should read like clear instructions to a colleague

## Getting Started

1. Install Meld: `npm install -g mlld`
2. Create a file `hello.mld`:
   ```mlld
   @text name = run [(whoami)]
   # Hello, {{name}}!
   
   Welcome to Meld. The current date is:
   run [(date)]
   ```
3. Run it: `mlld hello.mld`
4. See the output in `hello.o.md`

## Summary

mlld provides a straightforward way to work with AI systems and generate dynamic content. Its simple core syntax combined with an extensible module system allows for building complex workflows while maintaining readability and maintainability.
