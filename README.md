# mlld (pre-release -- beware dragons!)

mlld is a modular llm scripting language, bringing software engineering to LLM workflows: modularity, versioning, and reproducibility.

I still consider it 'early', but this isn't a slapped together idea. I've been working on it nearly every single day for 8 months straight.

[Give this to your LLM](https://mlld.ai/llms.txt)
[Syntax highlighting / LSP](https://marketplace.visualstudio.com/items?itemName=andyet.mlld-vscode)

## Installation

```bash
npm install -g mlld
```

or just run it with `npx mlld`

For CI/CD and serverless environments, use `npx mlldx` for ephemeral execution.

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
**Logical routing** - Use operators and conditions to route data and actions dynamically
**Modules** - Share and reuse workflows like npm packages 
**Reproducible** - Lock files ensure workflows run identically over time
**CI-ready** - `mlldx` runs without filesystem persistence for serverless/containers

## Quick Start

### 1. Basic Syntax

```mlld
/var @name = "Alice"                    # Create variable
/show `Hello @name!`                    # Display output
/show {echo "System: @name logged in"}  # Run a command and display output
/show js { console.log("Hello from JS"); "Done" }  # Run JS and display
/run {echo "Hidden output"}             # Silent run (no document output unless using show/log/output)
```

Only `/show`, `/output`, and `/log` produce output. Everything else sets up state.

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

/var @answer = run {claude -p "@question"} | @checkFacts | @improveClarity | @addExamples | log "refined" | show "done"

# Retry example: request one more attempt if validation fails
/exe @validate(input) = when [
  @isValid(@input) => @input
  @pipeline.try < 3 => retry
  * => "fallback"
]
/var @result = @answer | @validate
```

### 4. Iteration and Processing

```mlld
# For loops - execute actions for each item
/var @files = ["report.md", "summary.md", "notes.md"]
/for @file in @files => show `Processing: @file`

# Collect results with for expressions
/var @scores = [85, 92, 78, 95]
/var @grades = for @score in @scores => when: [
  @score >= 90 => "A"
  @score >= 80 => "B"
  true => "C"
]

# Cartesian products with foreach
/var @models = ["claude-3", "gpt-4", "gemini"]
/var @prompts = ["Explain X", "Compare Y", "Design Z"]
/exe @query(model, prompt) = run "@model -p '@prompt'"
/var @results = foreach @query(@models, @prompts)  << 9 results
```

## Modules ⚠️ registry is not live yet

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

## Conditional Logic and Routing

mlld provides conditional logic with operators and routing capabilities.

### Operators in Expressions

```mlld
# Comparison and logical operators
/var @canDeploy = @isProd && @testsPass && !@hasErrors
/var @userLevel = @score > 90 ? "expert" : "beginner"

# Use in conditions
/when @branch == "main" && @ci == "passing" => @deploy()
/when @user.role != "admin" => /show "Access denied"
```

### Logical Routing with `/when`

Route actions based on complex conditions:

```mlld
# Route requests based on method and path
/when first [
  @method == "GET" && @path == "/users" => @listUsers()
  @method == "POST" && @path == "/users" => @createUser()
  @method == "DELETE" => @deleteResource()
]

# Process features conditionally (implicit actions)
/when [
  @hasAuth => @authModule = "enabled"      # Implicit /var
  @hasChat => @loadChat()                  # Implicit /run
  @hasVideo => /import { video } from @company/video
]
```

### Value-Returning When Expressions

Use `when:` to create conditional values:

```mlld
/var @greeting = when: [
  @time < 12 => "Good morning"
  @time < 18 => "Good afternoon"
  true => "Good evening"
]

/exe @processData(type, data) = when: [
  @type == "json" => @jsonHandler(@data)
  @type == "xml" => @xmlHandler(@data)
  true => @genericHandler(@data)
]
```

Read more about [/when](docs/slash/when.md)

### /exe + when (critical pattern)

Define decision logic inside /exe using when blocks:

```mlld
/exe @grade(score) = when first [
  @score >= 90 => "A"
  @score >= 80 => "B"
  * => "C"
]

/show `Grade: @grade(91)`  # A
```

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
mlld file.mld --env .env.local   # Load environment variables from file
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
mlld test                        # Run all tests (auto-loads .env and .env.test)
mlld test array                  # Run tests matching pattern
mlld test --env custom.env       # Use custom environment file

# Module cache management
mlld clean @mlld/env             # Remove specific module from cache
mlld clean --all                 # Clear all cached modules
mlld clean --registry            # Clear only registry modules

# Analyze dependencies
mlld add-needs my-module.mld     # Auto-detect and add runtime deps
```

### CI/CD and Serverless (mlldx)

```bash
# Use mlldx for ephemeral environments (no filesystem persistence)
mlldx script.mld                 # Run with in-memory cache
mlldx script.mld --env prod.env  # Load environment variables
npx mlldx@latest ci-task.mld     # Perfect for CI pipelines

# Examples
mlldx github-action.mld          # GitHub Actions
mlldx vercel-function.mld        # Vercel/AWS Lambda
docker run -it node:18 npx mlldx@latest /scripts/task.mld
```

## Learn More

- [Documentation](docs/)
- [LLM Reference](llms.txt) - Give this to your AI assistant
- [Examples](examples/)
