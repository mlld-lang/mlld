# Meld Grammar Developer Guide

This guide explains the principles, patterns, and practices for developing and maintaining the Meld grammar. It serves as the primary reference for developers working on the grammar system.

> **For Grammar Consumers**: Use `npm run ast -- '<meld syntax>'` to explore the AST output and refer to [AST-CONTEXT-GUIDE.md](./AST-CONTEXT-GUIDE.md) for understanding the AST structure.

## Core Principles

### 1. **Abstraction-First Design**
Build reusable patterns at the appropriate abstraction level. Don't repeat parsing logic.

```peggy
// ❌ BAD: Repeating list logic
TextParamsList = first:Param rest:(_ "," _ p:Param { return p; })* { return [first, ...rest]; }
ImportList = first:Import rest:(_ "," _ i:Import { return i; })* { return [first, ...rest]; }

// ✅ GOOD: Abstract the pattern
GenericList(ItemRule, Separator)
  = first:ItemRule rest:(Separator item:ItemRule { return item; })* {
      return [first, ...rest];
    }

TextParamsList = GenericList(TextParam, CommaSpace)
ImportList = GenericList(ImportItem, CommaSpace)
```

### 2. **Hierarchical Pattern Organization**
Follow the established abstraction hierarchy (see [NAMING-CONVENTIONS.md](./NAMING-CONVENTIONS.md)):

```
Level 1: Core Primitives      → base/
Level 2: Variable References  → patterns/variables.peggy
Level 3: Content Patterns     → patterns/content.peggy
Level 4: Combinatorial        → patterns/
Level 5: Wrapped Patterns     → patterns/
Level 6: Directive Cores      → core/
Level 7: Directive Rules      → directives/
Level 8: RHS Patterns         → patterns/rhs.peggy
```

### 3. **Single Source of Truth**
Each pattern should be defined once and imported where needed.

```peggy
// ❌ BAD: Redefining variable patterns
// In content.peggy:
BracketVar = "@" id:BaseIdentifier { /* logic */ }

// In directives/text.peggy:
TextVar = "@" id:BaseIdentifier { /* same logic */ }

// ✅ GOOD: Import and use shared pattern
// In content.peggy:
BracketContent = '[' parts:(AtVar / TextSegment)* ']'
// AtVar is imported from patterns/variables.peggy
```

## Pattern Usage Guide

### Variable References
Always use the patterns from `patterns/variables.peggy`:

```peggy
// Direct variable reference: @varname
AtVar

// Template interpolation: {{varname}}
InterpolationVar

// ❌ NEVER create local variable patterns
```

### Content Handling
Use the appropriate wrapped pattern from `patterns/content.peggy`:

```peggy
// For paths (quotes, brackets, or unquoted)
WrappedPathContent

// For templates (quotes or double brackets)
WrappedTemplateContent  

// For commands (all interpolation types)
WrappedCommandContent

// For code blocks
WrappedCodeContent
```

### List Parsing
Use generic patterns (to be created in `patterns/lists.peggy`):

```peggy
// Instead of writing custom list logic:
ParameterList = GenericList(Parameter, CommaSpace)
ArgumentList = GenericList(Argument, CommaSpace)
```

### Directive Cores
Use core patterns from `core/` for directive logic:

```peggy
// ❌ BAD: Inline template parsing in directive
AtText = "@text" _ id:BaseIdentifier _ "=" _ template:TemplateStyleInterpolation { 
  // inline logic 
}

// ✅ GOOD: Use TemplateCore
AtText = "@text" _ id:BaseIdentifier _ "=" _ template:TemplateCore {
  // Use template.values, template.raw, template.meta
}
```

## Anti-Patterns to Avoid

### 1. **Local Variable Redefinition**
```peggy
// ❌ ANTI-PATTERN
MyRule = content:('[' parts:(MyLocalVar / Text)* ']')
MyLocalVar = "@" id:BaseIdentifier { /* reimplements AtVar */ }
```

### 2. **Duplicate List Logic**
```peggy
// ❌ ANTI-PATTERN  
Rule1List = first:Item rest:(_ "," _ item:Item { return item; })* { return [first, ...rest]; }
Rule2List = first:Thing rest:(_ "," _ thing:Thing { return thing; })* { return [first, ...rest]; }
```

### 3. **Inline Metadata Creation**
```peggy
// ❌ ANTI-PATTERN
{
  const meta = {
    path: {
      hasVariables: /* complex logic */,
      isAbsolute: rawPath.startsWith('/'),
      // repeated everywhere
    }
  };
}
```

### 4. **Ignoring Core Abstractions**
```peggy
// ❌ ANTI-PATTERN: Not using available cores
AtAdd = "@add" _ content:DoubleBracketContent {
  // Manually handling what TemplateCore does
}
```

### 5. **Inconsistent Naming**
```peggy
// ❌ ANTI-PATTERN: Not following naming conventions
myCustomVar = /* ... */        // Should be PascalCase
Path_Segment = /* ... */       // No underscores
pathpattern = /* ... */        // Should be PathPattern
```

## Development Workflow

### 1. **Before Creating a New Pattern**
- Check if it exists in `base/`, `patterns/`, or `core/`
- Check if a similar pattern can be generalized
- Ensure you're at the right abstraction level

### 2. **When Adding to a Directive**
- Use existing patterns from lower levels
- Don't reimplement variable, content, or list parsing
- Use directive cores for common logic

### 3. **Testing Patterns**
```bash
# Test your grammar changes
npm run build:grammar
npm run ast -- '@your directive syntax'

# Run tests to ensure nothing breaks
npm test grammar/
```

### 4. **Pattern Documentation**
Each pattern should have:
```peggy
// PATTERN NAME - Short description
// Used by: List of directives/patterns that use this
// Purpose: What this pattern matches and why

PatternName "Human-readable description"
  = /* implementation */
```

## File Organization

```
grammar/
├── base/           # Level 1: Core primitives
├── patterns/       # Levels 2-5: Reusable patterns
├── core/          # Level 6: Directive cores
├── directives/    # Level 7: Directive implementations
└── docs/          # Documentation (including this guide)
```

## Common Tasks

### Adding a New Directive
1. Check if similar directives exist
2. Identify required patterns (variable, content, list handling)
3. Use existing patterns and cores
4. Add to `directives/` with proper naming
5. Update `meld.peggy` to include it

### Creating a Shared Pattern
1. Identify duplication across files
2. Abstract to appropriate level
3. Place in correct directory
4. Update all usages to import
5. Document in the pattern file

### Refactoring Existing Code
1. Identify anti-patterns using this guide
2. Find or create appropriate abstraction
3. Update incrementally, testing each change
4. Ensure all tests pass

## Debugging

```javascript
// Use helpers.debug for tracing
helpers.debug('RuleName matched', { 
  data: relevantData,
  location: location() 
});
```

## Review Checklist

Before committing grammar changes:

- [ ] No duplicate patterns introduced
- [ ] Used existing abstractions where available  
- [ ] Followed naming conventions
- [ ] Added pattern documentation
- [ ] All tests pass
- [ ] Used `npm run ast` to verify output
- [ ] No inline variable/list/content parsing

## Resources

- [NAMING-CONVENTIONS.md](./NAMING-CONVENTIONS.md) - Naming standards
- [AST-CONTEXT-GUIDE.md](./AST-CONTEXT-GUIDE.md) - AST structure guide
- [Peggy.js Documentation](https://peggyjs.org/) - Parser generator docs