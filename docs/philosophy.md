# Philosophy

## The goal 

Mlld is designed to be a simple scripting language with minimal syntax:
- **8 core directives**: `@text`, `@data`, `@run`, `@add`, `@import`, `@path`, `@exec`, `@when`
- **2 advanced patterns**: `@map` (transformation), `with` (pipelines)
- **2 output rules**: Only `@add` and `@run` produce output
- **1 syntax rule**: Directives start with `@`, everything else is markdown

Additional functionality is provided through modules.

### Readability

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
{{tests}}
]]
```

Anyone can understand what this does, even without knowing mlld.

### Working with AI Systems

Traditional programming typically involves:
- Deterministic execution
- Predictable errors
- Binary success/failure
- Exact outputs

AI systems often exhibit:
- Probabilistic behavior
- Context-sensitive responses
- Varying degrees of success
- Results that may benefit from refinement

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

### Encoding Domain Knowledge

Organizations can create modules that reflect their specific practices:

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

### Structured Processing

"Chain of thought" asks AI to think step-by-step internally. Mlld's pipeline approach structures these steps explicitly:

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

### Collaborative Approach

Mlld is designed to facilitate working with AI systems:

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

## Design Considerations

mlld is built with several assumptions:

1. **AI capabilities continue evolving** - The language aims to accommodate new capabilities
2. **Complexity management** - Complex logic belongs in modules, keeping the core simple
3. **Pattern reuse** - Common patterns can be shared as modules
4. **Team collaboration** - Scripts should be readable and versionable

## Summary

mlld is intentionally minimal because:
- **Simplicity aids learning** - Designed to be accessible to users with varying technical backgrounds
- **Modules provide extensibility** - Additional functionality without core complexity
- **Different use case** - Focuses on orchestration and content generation rather than general programming
- **AI-oriented patterns** - Provides structured approaches for working with AI systems

Mlld aims to provide a straightforward way to coordinate AI-powered workflows and content generation.
