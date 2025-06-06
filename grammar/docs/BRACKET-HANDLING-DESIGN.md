# Bracket Handling Design

## Overview

This document describes the design for handling brackets in the mlld grammar. Brackets serve different purposes in different contexts, requiring a context-aware parsing approach.

## The Problem

Brackets in mlld have different semantics depending on context:

1. **Command brackets**: `@run [echo "test"]` - Shell commands with potential nested brackets
2. **Code brackets**: `@run python [data[0] = [1,2,3]]` - Language-specific syntax preservation
3. **Data brackets**: `@data arr = [1, @run [cmd], 3]` - Array literals with embedded directives
4. **Template brackets**: `[[Hello {{name}}]]` - Template content with interpolation

The challenge is disambiguating these contexts and applying appropriate parsing rules.

## Design Principles

1. **Context-Aware**: Use existing context predicates to determine bracket type
2. **Stateless**: Avoid state tracking that complicates backtracking
3. **Native Recursion**: Leverage Peggy's built-in recursive descent parsing
4. **Single Source of Truth**: Define patterns once, reuse everywhere

## Implementation

### 1. Special Variable Support

First, we handle special variables like `@.`, `@TIME`, `@INPUT` with case insensitivity:

```peggy
// In patterns/variables.peggy

SpecialVariable "Special reserved variable"
  = "@." {
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: 'PROJECTPATH',
        isSpecial: true,
        originalForm: '@.'
      }, location());
    }
  / "@" id:CaseInsensitiveSpecialVar {
      const normalized = id.toUpperCase();
      return helpers.createVariableReferenceNode('varIdentifier', {
        identifier: normalized === 'STDIN' ? 'INPUT' : normalized,
        isSpecial: true,
        originalCase: id,
        ...(normalized === 'STDIN' ? { deprecated: true } : {})
      }, location());
    }

CaseInsensitiveSpecialVar
  = [Tt] [Ii] [Mm] [Ee] { return 'TIME'; }
  / [Pp] [Rr] [Oo] [Jj] [Ee] [Cc] [Tt] [Pp] [Aa] [Tt] [Hh] { return 'PROJECTPATH'; }
  / [Ii] [Nn] [Pp] [Uu] [Tt] { return 'INPUT'; }
  / [Ss] [Tt] [Dd] [Ii] [Nn] { return 'STDIN'; }
```

### 2. Context-Aware Command Content

Commands use different parsing rules in different contexts:

```peggy
// In patterns/content.peggy

CommandContent
  = RHSContext &{ return helpers.isAfterRunDirective(input, offset()); }
    "[" parts:RHSCommandParts "]" { return parts; }
  / DirectiveContext "@run" _
    "[" parts:DirectCommandParts "]" { return parts; }

// Parts that can appear in commands
CommandParts
  = parts:(SpecialVariable / CommandVariable / CommandText)* {
      return parts.filter(p => p !== null);
    }
```

### 3. Native Bracket Balancing

Instead of character-level parsing, we use Peggy's native recursion:

```peggy
// Command brackets with native balancing
CommandBrackets
  = "[" content:CommandBracketContent* "]" {
      return content.flat();
    }

CommandBracketContent
  = SpecialVariable      // @., @TIME, etc.
  / CommandVariable      // @varname
  / NestedBrackets      // [...] preserved as text
  / QuotedString        // "..." or '...'
  / CommandTextChunk    // Regular text

// Handle nested brackets naturally
NestedBrackets
  = "[" content:BracketInnerContent* "]" {
      // Preserve the brackets in the text node
      const text = '[' + content.map(c => 
        typeof c === 'string' ? c : c.content || ''
      ).join('') + ']';
      return helpers.createNode(NodeType.Text, { content: text, location: location() });
    }

BracketInnerContent
  = NestedBrackets      // Recursive nesting
  / QuotedString
  / !"]" char:. { return char; }

// Efficient text capture
CommandTextChunk
  = chars:CommandTextChar+ {
      return helpers.createNode(NodeType.Text, { 
        content: chars.join(''), 
        location: location() 
      });
    }

CommandTextChar
  = ![@\[\]"'] char:. { return char; }
```

### 4. Context Detection Helpers

Simple, stateless helpers for context detection:

```typescript
// In grammar-core.ts

isAfterRunDirective(input: string, pos: number) {
  // Look back for @run within reasonable distance
  const lookback = Math.max(0, pos - 20);
  const before = input.substring(lookback, pos);
  return /@run\s*$/.test(before);
},

isAfterExecDirective(input: string, pos: number) {
  // Check if we're in an exec RHS
  const lookback = Math.max(0, pos - 50);
  const before = input.substring(lookback, pos);
  return /@exec\s+\w+\s*\([^)]*\)\s*=\s*$/.test(before);
},

isInDataContext(input: string, pos: number) {
  // Look for @data assignment pattern
  const lookback = Math.max(0, pos - 50);
  const before = input.substring(lookback, pos);
  return /@data\s+[\w.]+\s*=\s*/.test(before);
}
```

## Benefits

1. **No State Management**: Avoids complex state tracking and backtracking issues
2. **Natural Nesting**: Handles arbitrary bracket depth automatically
3. **Context Appropriate**: Different rules for different contexts
4. **Performance**: Efficient text chunk capture instead of character-by-character
5. **Maintainable**: Clear separation of concerns and reusable patterns

## Testing Strategy

1. **Unit Tests**: Test each context independently
2. **Integration Tests**: Verify bracket handling across directives
3. **Edge Cases**: Nested brackets, quotes, special characters
4. **Performance**: Large files with complex nesting

## Future Considerations

1. **Error Recovery**: Better error messages for unmatched brackets
2. **Syntax Highlighting**: Expose context information for editors
3. **Additional Contexts**: Easy to add new bracket contexts as needed