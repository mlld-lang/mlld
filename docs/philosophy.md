# The Mlld Philosophy

## Core Principle: Learnable and Powerful

Mlld is built on a fundamental insight: **working with AI requires a different kind of language**. Not a programming language that treats AI as a deterministic function, but an orchestration language that treats AI as a collaborative partner.

## The 10-Minute Promise

You can learn the entire mlld language in 10 minutes:
- **8 core directives**: `@text`, `@data`, `@run`, `@add`, `@import`, `@path`, `@exec`, `@when`
- **2 advanced patterns**: `@map` (transformation), `with` (pipelines)
- **2 output rules**: Only `@add` and `@run` produce output
- **1 syntax rule**: Directives start with `@`, everything else is markdown

That's it. Everything else is modules.

## Why Simplicity Matters

### 1. Cognitive Load

When orchestrating AI systems, your mental energy should focus on:
- What questions to ask
- How to structure context
- What transformations to apply

Not on:
- Syntax details
- Error handling patterns
- Type systems
- Memory management

### 2. Readability as a Feature

Mlld scripts should read like recipes or instructions to a colleague:

```mld
@import { analyzeCode, writeTests, checkSecurity } from @dev/tools

@text code = @path [src/auth.js]
@text analysis = @run @analyzeCode(@code)
@text tests = @run @writeTests(@code, @analysis)
@text security = @run @checkSecurity(@code)

@add [[## Security Analysis
{{security}}

## Generated Tests
{{tests}}]]
```

Anyone can understand what this does, even without knowing mlld.

### 3. AI Systems Are Not Software

Traditional programming assumes:
- Deterministic execution
- Predictable errors
- Binary success/failure
- Exact outputs

AI systems are:
- Probabilistic
- Context-sensitive
- Gradient success
- Requiring refinement

Mlld embraces this reality instead of fighting it.

## The Module Ecosystem

### Complexity Has a Home

While mlld stays simple, modules can be as sophisticated as needed:

```javascript
// @mlld/document-intel module
export async function analyzeDocument(doc, options = {}) {
  const { 
    models = ['claude-3', 'gpt-4'],
    perspectives = ['technical', 'business', 'legal'],
    iterations = 3,
    consensusThreshold = 0.8
  } = options;
  
  // Complex orchestration logic here
  // Parallel processing, retries, validation
  // All hidden from the mlld script
}
```

### Institutional Knowledge as Code

Organizations can encode their expertise into modules:

```mld
@import { 
  codeReview,      # Embeds company coding standards
  securityAudit,   # Knows company security policies
  prDescription    # Follows company PR template
} from @company/engineering

# One line, but carries years of institutional knowledge
@text review = @run @codeReview(@changes)
```

### Sharing and Evolution

Modules can be:
- **Published** to npm or private registries
- **Versioned** with semantic versioning
- **Tested** with standard testing frameworks
- **Documented** with JSDoc and examples
- **Typed** with TypeScript for IDE support

## Pipeline of Thought

### Beyond Chain of Thought

"Chain of thought" asks AI to think step-by-step internally. "Pipeline of thought" **enforces** those steps externally:

```mld
# Each stage has ONE job, does it well
@exec validateFacts(content) = @run @claude {
  prompt: [[Check facts in: {{content}}. Return corrected version.]]
}

@exec simplifyLanguage(content) = @run @claude {
  prompt: [[Simplify to 8th-grade level: {{content}}]]
}

@exec addSources(content) = @run @claude {
  prompt: [[Add citations for all claims: {{content}}]]
}

# Pipeline ensures quality through specialization
@text article = @run @claude { prompt: @topic } with {
  pipeline: [@validateFacts, @simplifyLanguage, @addSources]
}
```

### Reliability Through Specialization

Each pipeline stage:
- Has a narrow, specific purpose
- Can be tested independently
- Can be improved without affecting others
- Can be reused across different workflows

## The Collaboration Paradigm

### Working With, Not Programming

Mlld encourages thinking of AI as a knowledgeable colleague:

```mld
# This reads like delegating to team members
@text specs = "Build a user authentication system"
@text architecture = @run @technicalArchitect { prompt: @specs }
@text security = @run @securityExpert { prompt: @architecture }
@text implementation = @run @seniorDeveloper { prompt: @architecture }
```

### Context Over Control

Instead of trying to control AI outputs, provide better context:

```mld
@import { projectContext, teamStandards, recentDecisions } from @project/knowledge

# Rich context leads to relevant outputs
@text recommendation = @run @claude {
  context: [@projectContext, @teamStandards, @recentDecisions],
  prompt: "Should we migrate to microservices?"
}
```

## Design Principles

### 1. Explicit Over Implicit
- Clear directive names (`@text`, not `$` or `let`)
- Visible data flow (only `@add` outputs)
- No hidden state or side effects

### 2. Composition Over Configuration
- Small directives that combine well
- Modules for complex behavior
- Pipelines for transformation chains

### 3. Markdown First
- Everything is markdown until marked otherwise
- Output is markdown by default
- Syntax highlighting works everywhere

### 4. Errors Are Content
- AI doesn't throw exceptions
- "Errors" are usually misunderstandings
- Pipelines transform problems into solutions

## The Future

Mlld represents a bet on the future of human-AI collaboration:

1. **AI capabilities will expand** - The language shouldn't limit them
2. **Complexity will grow** - But should live in modules, not syntax
3. **Patterns will emerge** - And be shareable as modules
4. **Teams will collaborate** - Through readable, versioned scripts

## Summary

Mlld is intentionally minimal because:
- **Simplicity enables mastery** - Learn once, use forever
- **Modules enable power** - Unlimited extension without complexity
- **Orchestration differs from programming** - Different problem, different tool
- **AI collaboration needs new patterns** - Pipeline of thought, not chain of thought

The goal isn't to build another programming language. It's to create the perfect orchestration layer for the age of AI collaboration.