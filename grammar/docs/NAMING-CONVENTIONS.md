# Mlld Grammar Naming Conventions

This document outlines the standardized naming conventions for the Mlld grammar system, ensuring consistency and clarity across abstraction layers.

## Abstraction Hierarchy

The Mlld grammar uses a hierarchical abstraction system with distinct naming patterns for each level:

```
Level 1: Core Primitives      - Foundational elements (tokens, segments)
Level 2: Variable References  - Variable reference patterns
Level 3: Content Patterns     - Content handling patterns
Level 4: Combinatorial        - Pattern combinations
Level 5: Wrapped Patterns     - Container patterns with metadata
Level 6: Directive Cores      - Reusable directive logic
Level 7: Directive Rules      - Full directive implementations
Level 8: RHS Patterns         - Right-hand side patterns
```

## Naming Pattern Standard

### Prefixes

- `Base*` - Fundamental abstractions (BaseToken, BaseSegment)
- `At*` - Directive types (AtRun, AtText, AtPath)
- `Wrapped*` - Container patterns that provide structured output (WrappedPathContent)

### Suffixes

- `*Identifier` - Identifiers and names (VariableIdentifier)
- `*Pattern` - Matching patterns (InterpolationPattern)
- `*Interpolation` - Variable insertion patterns (CommandInterpolation)
- `*Content` - Content production (TemplateContent)
- `*Core` - Reusable logic (RunCommandCore)
- `*Context` - Context detection predicates (DirectiveContext)
- `*Segment` - Basic text pieces (TextSegment)
- `*Separator` - Delimiter characters (PathSeparator)
- `*Whitespace` - Spacing patterns (HorizontalWhitespace)
- `*Literal` - Literal values (StringLiteral)
- `*Assignment` - Assignment operations (TextAssignment)
- `*Reference` - Reference operations (VariableReference)
- `*Token` - Atomic lexical elements (PathSeparatorToken)
- `*List` - Comma-separated lists (ParameterList, not ParametersList)

## Examples

### Level 1: Core Primitives
- `BaseIdentifier` - Basic identifier pattern
- `PathSeparatorToken` - Path separator token
- `StringLiteral` - String literal value
- `TextSegment` - Basic text segment

### Level 2: Variable References
- `AtVar` - @var syntax (direct reference)
- `InterpolationVar` - {{var}} syntax (template interpolation)

### Level 3: Content Patterns
- `BracketContent` - Content within brackets with @var interpolation
- `DoubleBracketContent` - Content with {{var}} interpolation

### Level 4: Combinatorial Patterns
- `PathInterpolation` - For paths (quotes, brackets, unquoted)
- `TemplateInterpolation` - For templates (quotes, double brackets)

### Level 5: Wrapped Patterns
- `WrappedPathContent` - For paths in directives
- `WrappedTemplateContent` - For templates in directives

### Level 6: Directive Cores
- `RunCommandCore` - Core logic for run command
- `TextValueCore` - Core logic for text values

### Level 7: Directive Implementations
- `AtRun` - Run directive implementation
- `AtText` - Text directive implementation

## Subtype Naming Conventions

When naming directive subtypes, follow these patterns:

### Composition Pattern: Operation + ContentType
For operations that work on specific content types:
- `textPath` - Text directive operating on path content
- `textPathSection` - Text directive extracting section from path
- `addPath` - Add directive including path content  
- `addPathSection` - Add directive extracting section from path

**Not**: `textSection` or `addSection` (unclear what the section is from)

### Rationale
Section extraction is meaningless without a path - it's always a section OF a path. The naming should reflect this relationship.

### Level 8: RHS Patterns
- `RunRHS` - Run directive on right-hand side
- `TextRHS` - Text directive on right-hand side

## Grammar Rule Naming Format

For consistency, grammar rules should follow these patterns:

1. **Rule Names**: PascalCase for all rules
2. **Comments**: Include a string literal description after the rule name
   ```
   TextSegment "Plain text segment"
     = ...
   ```
3. **Debug Statements**: Standardized format for debug output
   ```
   helpers.debug('RuleName matched', { details });
   ```
4. **Location Capture**: Consistent location capture for AST nodes
   ```
   return helpers.createNode(NodeType.Text, { content }, location());
   ```

## Implementation Guidelines

1. Use the correct prefix/suffix combination that best describes the rule's purpose and level
2. Maintain consistency within abstraction levels
3. Document each rule with a clear string description
4. Use structured debug output with rule name and relevant details
5. Follow the abstraction hierarchy for rule dependencies

## Avoiding Duplicate Patterns

### Single Source of Truth
Each pattern should be defined exactly once:

- **Variable patterns**: Only use `AtVar` and `InterpolationVar` from `patterns/variables.peggy`
- **List patterns**: Use generic list patterns from `patterns/lists.peggy` (when created)
- **Content patterns**: Use wrapped patterns from `patterns/content.peggy`

### Pattern Variants vs New Patterns
When a pattern needs context-specific behavior:

```peggy
// ❌ BAD: Creating new pattern
BracketVar = "@" id:BaseIdentifier { /* duplicate logic */ }

// ✅ GOOD: Using existing pattern with context
BracketContent = '[' parts:(AtVar / TextSegment)* ']'
```

### Deprecation and Removal
Legacy patterns should be:
1. Marked with a comment: `// DEPRECATED: Use AtVar instead`
2. Removed in the next major refactor
3. Never used in new code

Example: `PathVar` is deprecated in favor of `AtVar`

This standard naming convention improves readability, maintainability, and ensures new grammar rules integrate seamlessly with the existing system.