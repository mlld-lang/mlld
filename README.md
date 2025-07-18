# mlld (pre-release)

mlld is a modular prompt scripting language, bringing software engineering to LLM workflows: modularity, versioning, and reproducibility.

I still consider it 'early', but this isn't a slapped together idea. I've been working on it nearly every single day for 6 months straight. It has tools for writing tests and a public/private module system.

[Give this to your LLM](https://mlld.ai/llms.txt)

## Installation

```bash
npm install -g mlld
```

or just run it with `npx mlld`

## What is mlld for?

- makes context and prompt engineering multiplayer and git-versionable
- turns markdown documents into subsection-addressable modules
- public and private modules for prompts and processing
- complex chaining and filtering of LLM calls
- abstract out processing complexity in modules, keep things readable
- get a better handle on the explosion of llm workflow tool cruft

## Here's a simple example

Use mlld to create a daily standup update based on your recent activity:

```mlld
/var @commits = run {git log --since="yesterday"}
/var @prs = run {gh pr list --json title,url,createdAt}

/exe @claude(request) = run {claude -p "@request"}
/exe @formatPRs(items) = js {
  return items.map(pr => `- PR: ${pr.title} (${pr.url})`).join('\n');
}

/var @prompt = `
  Write a standup update in markdown summarizing the work I did 
  yesterday based on the following commits and PRs.

  ## Commits:
  @commits

  ## PRs:
  @formatPRs(@prs)
`
/show @claude(@prompt)
```

## Installation

```bash
npm install -g mlld
```

## Why?

**Context engineering** - Compose prompts from multiple sources instead of mega-prompts or lots of legwork 
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

```mlld
/import { formatDate, validate } from @alice/utils
/import { analyze } from @company/tools

/var @report = @analyze(@data) | @validate
```

### Private Modules

```bash
mlld setup  # Interactive setup for GitHub repos
```

Now `@company/prompts` resolves directly from your private GitHub repository.

### Publishing Modules

```bash
mlld init my-module.mld.md       # Create module
mlld publish my-module.mld.md    # Publish to registry
```

## Conditional actions with `/when`

mlld's `/when` allows firing actions based on booleans. Combining this with modules makes this even more useful.

```mlld
/var @hasReadme = run {test -f README.md && echo "true" || echo ""}
/var @hasLicense = run {test -f LICENSE && echo "true" || echo ""}
/var @hasTests = run {test -d tests -o -d test && echo "true" || echo ""}
/var @hasSecurity = run {test -f SECURITY.md && echo "true" || echo ""}
/var @hasCI = run {test -f .github/workflows/ci.yml && echo "true" || echo ""}

/when @projectQuality: [
  @hasReadme  => /show `✓ Documentation present`
  @hasLicense => /show `✓ License included`
  @hasTests   => /show `✓ Test suite found`
  @hasCI      => /show `✓ CI/CD configured`
]
```

You can also use `/when` with `any`, `all`, or `first` (classic switch)

Read more about [/when](docs/slash/when.md)

## Not a Programming Language

mlld is minimal. That's intentional. Complex logic lives in modules:

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
mlld init utils                  # Create specific module file

# Publish modules
mlld auth login                  # Authenticate with GitHub
mlld publish my-module.mld.md    # Publish to registry
mlld publish --private           # Publish to private repo
```

### Project Configuration

```bash
# Interactive setup wizard
mlld setup                       # Configure private modules, aliases, etc.

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
# Testing
mlld test                        # Run all tests
mlld test array                  # Run tests matching pattern

# Module cache management
mlld clean @mlld/env             # Remove specific module from cache
mlld clean --all                 # Clear all cached modules
mlld clean --registry            # Clear only registry modules

# Analyze dependencies
mlld add-needs my-module.mld     # Auto-detect and add runtime deps
```

## Learn More

- [Documentation](docs/)
- [LLM Reference](llms.txt) - Give this to your AI assistant
- [Examples](examples/)
