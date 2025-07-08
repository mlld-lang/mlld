# mlld: Context Engineering for LLMs

mlld is a scripting language that makes LLM workflows reproducible, shareable, and versionable. It transforms markdown documents into executable AI pipelines while keeping them readable as documentation.

## The Problem mlld Solves

Working with LLMs today means juggling prompts across files, copying context between projects, and hoping yesterday's workflow still works today. Teams struggle to share prompt engineering expertise. Complex workflows become unmaintainable prompt spaghetti. There's no "Make" or "npm" for the AI era.

mlld changes this by providing a simple, explicit syntax for orchestrating LLMs, commands, and data transformations. Your workflows become living documentation that executes.

## Core Design: Markdown That Runs

mlld enhances markdown with directives. Any line starting with `/` is a command. Everything else remains readable documentation:

```mlld
# Customer Support Analysis

This workflow analyzes support tickets for sentiment and priority.

/import { analyzeSentiment, extractKeywords } from @company/nlp-tools
/var @tickets = run {curl -s api.internal.com/support/recent}

## Analysis Results

/var @analysis = @tickets | @analyzeSentiment | @extractKeywords
/show @analysis
```

This document is simultaneously a runnable script and readable documentation. On GitHub, it renders as formatted markdown. When executed with `mlld`, it performs the analysis.

## Context Engineering Through Composition

Instead of cramming everything into monolithic prompts, mlld lets you compose context from multiple sources:

```mlld
/import { codebaseContext } from @team/project-docs
/import { styleGuide, voiceGuidelines } from @company/standards

/var @currentPR = run {gh pr view --json files,title,body}
/var @recentCommits = run {git log --oneline -10}

/var @reviewPrompt = `
Review this PR for our codebase:

@codebaseContext

Style requirements:
@styleGuide

PR Details:
@currentPR

Recent changes:
@recentCommits
`

/run {claude -p "@reviewPrompt"}
```

Each piece of context stays modular, testable, and reusable. Update the style guide in one place; every workflow using it gets the changes.

## Pipelines: Iterative Refinement

The pipeline operator `|` chains transformations, enabling "pipeline of thought" patterns:

```mlld
/exe @checkAccuracy(response) = run "claude -p 'Review for factual accuracy: @response'"

/exe @applyVoiceGuidelines(response) = run "claude -p 'Apply our voice guidelines to: @response'"

/exe @addExamples(response) = run "claude -p 'Add concrete examples: @response'"

/var @answer = run {claude -p "@customerQuestion"} |
  @checkAccuracy |
  @applyVoiceGuidelines |
  @addExamples

/show @answer
```

Each pipeline stage focuses on one transformation. This makes complex refinements debuggable and your organization's standards enforceable.

## Multi-Model Consensus and Cartesian Products

mlld's `foreach` enables systematic multi-perspective analysis:

```mlld
/var @models = ["claude-3", "gpt-4", "gemini-pro"]
/var @perspectives = [
  { "role": "security expert", "focus": "vulnerabilities" },
  { "role": "UX designer", "focus": "usability" },
  { "role": "architect", "focus": "scalability" }
]

/exe @analyze(model, perspective) = run "@model --system 'You are a @perspective.role' -p 'Review this design focusing on @perspective.focus: @design'"

/var @reviews = foreach @analyze(@models, @perspectives)
>> 9 reviews: 3 models × 3 perspectives

/var @consensus = run "claude -p 'Synthesize these reviews: @reviews'"
```

This cartesian product approach ensures comprehensive analysis without manual coordination.

## Module Ecosystem

mlld modules work like npm packages for AI workflows. Install from the public registry or use private modules directly from GitHub:

```mlld
/import { codeReview, securityAudit } from @company/dev-tools
/import { formatReport, validateJSON } from @alice/utils
/import { githubActions } from @templates/ci-cd

/var @report = @codeReview(@sourcecode) | 
  @securityAudit |
  @formatReport

/output @report to "analysis.md"
```

Private modules work natively - just run `mlld setup` to configure your GitHub repositories:

```bash
mlld setup
```

The interactive wizard walks you through connecting to your private GitHub repos. Once configured, `@company/dev-tools` resolves straight from your repository. No registry middleman, no publication process - just push to your repo and import.

Modules encapsulate expertise. A security expert publishes `@security/webapp-audit` to the public registry. Your team shares `@company/standards` privately. Both work seamlessly together.

## Reproducible Workflows

Lock files ensure reproducibility:

```json
{
  "modules": {
    "@company/dev-tools": {
      "resolved": "github:company/mlld-modules#v2.1.0",
      "integrity": "sha256:abc123...",
      "needs": ["js", "gh-cli"]
    }
  }
}
```

Your AI workflow from six months ago runs identically today. Version control for prompt engineering becomes reality.

## Not a Programming Language

mlld deliberately lacks loops, conditionals, and complex logic. This isn't a limitation - it's the point. When you need algorithms, use modules:

```mlld
/import { validateSchema, retry, parallel } from @mlld/core

/var @results = @parallel(@tasks, { "concurrency": 5 })
/var @validated = @validateSchema(@results, @schema)
```

Your `.mld` files stay focused on orchestration. Implementation complexity lives in testable, reusable modules.

## Real-World Impact

Teams using mlld report:
- **Reduced prompt duplication** - Shared modules eliminate copy-paste workflows
- **Consistent AI outputs** - Pipeline stages enforce organizational standards  
- **Faster onboarding** - New developers understand workflows by reading them
- **Audit trails** - Every AI decision flow is versioned and reviewable
- **Cross-team collaboration** - Prompt engineering expertise becomes shareable

## Getting Started

```bash
npm install -g mlld

# Create your first workflow
mlld init analyze-pr.mld.md

# Install modules
mlld install @company/standards @tools/github

# Run it
mlld analyze-pr.mld.md
```

mlld brings software engineering practices to AI workflows: modularity, versioning, testing, and reusability. It's infrastructure for the age of AI pair programming - where humans orchestrate and LLMs execute, with full transparency and control.