# Use Case: Living Documentation System

## The Challenge

Documentation is perpetually out of date. It's written once, rarely updated, and disconnected from the actual code. How can we create documentation that stays fresh, accurate, and useful?

## The Mlld Solution

```mld
@import { analyzeCode, extractAPI, findExamples } from @mlld/code-intel
@import { technicalWriter, apiDocumenter } from @company/doc-standards

# Scan the codebase
@data modules = @run [(find src -name "*.ts" -o -name "*.js" | grep -v test)]
@data apis = @map @extractAPI(@modules)
@data examples = @run @findExamples(@apis)

# Generate module documentation
@exec documentModule(module) = @run @technicalWriter([[
  Document this module for developers:
  
  Code: {{module.code}}
  API: {{module.api}}
  Examples: {{module.examples}}
  
  Include:
  - Purpose and overview
  - API reference with types
  - Usage examples
  - Common patterns
  - Troubleshooting
]]) with {
  pipeline: [
    @ensureAccuracy,
    @addTypeDefinitions,
    @validateExamples,
    @formatMarkdown
  ]
}

@data docs = @map @documentModule(@modules)

# Generate README with live data
@text readme = [[
# {{package.name}} v{{package.version}}

![Build Status]({{ci.badge}})
![Coverage]({{coverage.badge}})
![Last Commit]({{git.lastCommit}})

## Overview

{{projectSummary}}

## Quick Start

```bash
npm install {{package.name}}
```

```javascript
{{quickStartExample}}
```

## Modules

{{docs}}

## Contributing

{{contributingGuide}}

---
*Documentation auto-generated on {{@TIME}} by mlld*
]]

@write { file: "README.md", content: @readme }

# Generate API documentation
@text apiDocs = @run @apiDocumenter(@apis) with {
  pipeline: [
    @addTypeScriptDefinitions,
    @generateOpenAPISpec,
    @createInteractiveExamples
  ]
}

@write { file: "docs/API.md", content: @apiDocs }
```

## Advanced: Context-Aware Documentation

```mld
# Detect what changed and update only affected docs
@text changes = @run [(git diff --name-only main...HEAD)]
@data affectedModules = @run @findAffectedModules(@changes)

# Smart updates - only regenerate what changed
@foreach module in @affectedModules {
  @text oldDoc = @path [docs/modules/@module.name.md]
  @text newDoc = @run @documentModule(@module)
  
  # Show what changed
  @text docDiff = @run @compareDocumentation(@oldDoc, @newDoc)
  
  @when @docDiff.hasSignificantChanges {
    @write { file: "docs/modules/@module.name.md", content: @newDoc }
    @add [[Updated documentation for {{module.name}}]]
  }
}
```

## Documentation Styles

Different documentation for different audiences:

```mld
@data audiences = [
  { 
    name: "developers",
    writer: @technicalWriter,
    focus: "implementation details, API reference, examples"
  },
  {
    name: "users", 
    writer: @userDocWriter,
    focus: "features, tutorials, FAQ"
  },
  {
    name: "executives",
    writer: @executiveSummaryWriter,
    focus: "capabilities, ROI, strategic value"
  }
]

@data allDocs = @map @generateForAudience(@audiences) where:
  @exec generateForAudience(audience) = @run @audience.writer([[
    Write {{audience.name}} documentation focusing on: {{audience.focus}}
    
    Project info: {{projectContext}}
  ]])
```

## Living Architecture Diagrams

```mld
@import { generateMermaid, analyzeDependencies } from @mlld/architecture

# Analyze codebase structure
@data dependencies = @run @analyzeDependencies(@modules)

# Generate architecture diagram
@text diagram = @run @claude([[
  Create a Mermaid diagram showing the architecture:
  
  Modules: {{modules}}
  Dependencies: {{dependencies}}
  
  Focus on:
  - Service boundaries
  - Data flow
  - Key integrations
]]) with {
  pipeline: [@validateMermaidSyntax, @optimizeLayout]
}

@add [[## System Architecture

```mermaid
{{diagram}}
```

*Generated from current codebase structure*]]
```

## Automatic Migration Guides

When breaking changes are detected:

```mld
@text breakingChanges = @run @detectBreakingChanges(@oldAPI, @newAPI)

@when @breakingChanges {
  @text migrationGuide = @run @claude([[
    Create a migration guide for these breaking changes:
    {{breakingChanges}}
    
    Include:
    - What changed and why
    - Step-by-step migration instructions
    - Code examples (before/after)
    - Automated migration script if possible
  ]]) with {
    pipeline: [
      @validateMigrationSteps,
      @testMigrationExamples,
      @addAutomationScripts
    ]
  }
  
  @write { file: "MIGRATION.md", content: @migrationGuide }
  @run [(git add MIGRATION.md && git commit -m "Add migration guide for v@newVersion")]
}
```

## Benefits

1. **Always Current** - Documentation updates with every code change
2. **Multiple Perspectives** - Different docs for different audiences
3. **Verified Examples** - Code samples are tested automatically
4. **Change Detection** - Only update what needs updating
5. **Rich Context** - Documentation aware of entire codebase

## Integration Ideas

- **PR Checks** - Ensure documentation updates with code changes
- **Release Automation** - Generate changelog and migration guides
- **API Portal** - Live, interactive API documentation
- **Knowledge Base** - Searchable, AI-enhanced documentation
- **Onboarding** - Personalized documentation for new team members