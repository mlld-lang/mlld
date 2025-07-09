# mlld (pre-release)

mlld is a modular prompt scripting language.

[Give this to your LLM](https://mlld.ai/llms.txt)

## Installation

```bash
npm install -g mlld
```

or just run it with `npx mlld`

## What is mlld?

mlld transforms markdown documents into reproducible AI pipelines. Any line starting with `/` is a command. Everything else stays readable documentation.

```mlld
/var @commits = run {git log --since="yesterday"}
/var @prs = run {gh pr list --author="@me"}
/var @prompt = `

  Write a concise, bulleted standup summary for the work I completed yesterday based on the following commits and PRs. Use markdown formatting.

  ## Commits:
  @commits

  ## PRs:
  @prs
`
/exe @claude(request) = run {claude -p "@request"}
/show @claude(@prompt)
/output "standup.md"

```

## Installation

```bash
npm install -g mlld
```

## Why?

**Context engineering** - Compose prompts from multiple sources instead of mega-prompts  
**Pipelines** - Chain LLM calls with `|` for iterative refinement  
**Modules** - Share and reuse workflows like npm packages 
**Reproducible** - Lock files ensure workflows run identically over time

## Quick Start

### 1. Basic Syntax

```mlld
/var @name = "Alice"                    # Create variable
/show `Hello @name!`                    # Display output
/run {echo "System: @name logged in"}   # Run commands
```

Only `/show`, `/run`, and `/output` produce output. Everything else sets up state.

### 2. Context Composition

```mlld
/import { codeStyle } from @company/standards
/var @currentPR = run {gh pr view --json body}
/var @prompt = `
Review this PR against our style guide:

Style: @codeStyle
PR: @currentPR
`
/run {claude -p "@prompt"}
```

### 3. Pipeline Refinement

```mlld
/exe @checkFacts(text) = run "claude -p 'Verify facts in: @text'"
/exe @improveClarity(text) = run "claude -p 'Rewrite for clarity: @text'"
/exe @addExamples(text) = run "claude -p 'Add examples to: @text'"

/var @answer = run {claude -p "@question"} | @checkFacts | @improveClarity | @addExamples
```

### 4. Cartesian Products

```mlld
/var @models = ["claude-3", "gpt-4", "gemini"]
/var @prompts = ["Explain X", "Compare Y", "Design Z"]

/exe @query(model, prompt) = run "@model -p '@prompt'"
/var @results = foreach @query(@models, @prompts)  << 9 results
```

## Modules

### Using Modules

```bash
mlld install @alice/utils @company/tools
```

```mlld
/import { formatDate, validate } from @alice/utils
/import { analyze } from @company/tools

/var @report = @analyze(@data) | @validate
```

### Private Modules

```bash
mlld setup  # Interactive setup for GitHub repos
```

Now `@company/tools` resolves directly from your private GitHub repository.

### Publishing Modules

```bash
mlld init my-module.mld.md       # Create module
mlld publish my-module.mld.md    # Publish to registry
```

## Not a Programming Language

mlld has no loops, no conditionals, no recursion. That's intentional. Complex logic lives in modules:

```mlld
/import { retry, parallel, validate } from @mlld/core

/var @results = @parallel(@tasks, {"concurrency": 5})
```

Your `.mld` files stay readable. Modules handle complexity.

## Examples

### Code Review Workflow

```mlld
/import { styleGuide } from @company/standards
/import { githubContext } from @tools/github

/var @changes = run {git diff main..HEAD}
/var @context = @githubContext()

/exe @review(perspective) = run {
  claude -p "As a @perspective, review: @changes with context: @context"
}

/var @reviews = foreach @review([
  "security expert",
  "performance engineer", 
  "API designer"
])

/output @reviews to "review.md"
```

### Multi-Model Consensus

```mlld
/var @question = "What are the tradeoffs of microservices?"

/exe @ask(model) = run "@model -p '@question'"
/var @responses = foreach @ask(["claude", "gpt-4", "gemini"])

/var @consensus = run {
  claude -p "Synthesize these viewpoints: @responses"
}

/show @consensus
```

## Essential CLI Commands

### Running mlld Files

```bash
mlld file.mld                    # Process file, output to file.md
mlld file.mld --stdout           # Output to terminal
mlld file.mld --format xml       # Output as XML
mlld file.mld --watch            # Auto-rerun on changes
```

### Module Management

```bash
# Create modules
mlld init                        # Interactive module creation
mlld init utils.mld.md           # Create specific module file

# Install modules
mlld install @alice/utils        # Install specific module
mlld install                     # Install all from lock file
mlld ls                          # List installed modules

# Publish modules
mlld auth login                  # Authenticate with GitHub
mlld publish my-module.mld.md    # Publish to registry
mlld publish --private           # Publish to private repo
```

### Project Configuration

```bash
# Interactive setup wizard
mlld setup                       # Configure GitHub repos, aliases, etc.

# Create path aliases
mlld alias --name lib --path ./src/lib
mlld alias --name shared --path ../shared --global

# Manage environment variables
mlld env allow GITHUB_TOKEN API_KEY
mlld env list                    # Show allowed vars
```

### Running Scripts

```bash
# Run scripts from configured directory (default: llm/run/)
mlld run                         # List available scripts
mlld run analyze-pr              # Run analyze-pr.mld from script dir
mlld run data/process            # Run nested scripts
```

### Development Tools

```bash
# Analyze dependencies
mlld add-needs my-module.mld     # Auto-detect and add runtime deps

# Testing
mlld test                        # Run all tests
mlld test array                  # Run tests matching pattern

# Language server
mlld language-server             # Start LSP for editor integration
```

## Learn More

- [Documentation](docs/)
- [LLM Reference](llms.txt) - Give this to your AI assistant
- [Examples](examples/)

---

mlld brings software engineering to AI workflows: modularity, versioning, and reproducibility.
