# Proposed TypeScript Type Improvements for ContentResolver

## Current Challenges in ContentResolver

After analyzing the `ContentResolver` and `StringLiteralHandler` classes, I've identified several areas where improved TypeScript types for the `@define` directive would significantly improve code robustness and maintainability:

## 1. Define Command Structure Type Enhancements

### Problem
The `ContentResolver` doesn't have explicit typing for handling `@define` directive content. It currently treats all content generically, which could lead to errors when working with the specialized structure of command templates.

### Proposed Type Improvement
```typescript
// Define explicit types for command templates
type CommandParameterList = string[];

// Discriminated union for different command types
type DefineCommandTemplate = 
  | { 
      kind: 'basic'; 
      parameters: CommandParameterList;
      template: string;
    }
  | {
      kind: 'language';
      language: 'js' | 'python' | 'bash';
      parameters: CommandParameterList;
      codeBlock: string;
    };

// Complete structure for @define directive
interface DefineCommand {
  name: string;
  template: DefineCommandTemplate;
  metadata?: {
    definedAt: string; // file path
    line: number;
  };
}
```

### Justification
1. **Error Prevention**: A strongly typed `DefineCommand` interface would prevent accidental mishandling of command templates in the resolution process.
2. **Self-Documentation**: The discriminated union makes it clear that there are two distinct types of commands with different resolution requirements.
3. **IDE Support**: Provides better autocomplete and validation during development.
4. **Consistent Handling**: Ensures parameters are consistently processed across the codebase.

## 2. String Literal Resolution Type Safety

### Problem
The `StringLiteralHandler` has complex validation logic for different string types, but lacks a formal type system to represent the different quote styles and their constraints.

### Proposed Type Improvement
```typescript
// Define literal quote types with their characteristics
type QuoteType = "'" | '"' | '`';

interface StringLiteralConfig {
  quoteType: QuoteType;
  allowsNewlines: boolean;
  requiresEscaping: QuoteType[];
}

// Map of quote types to their configurations
const QUOTE_CONFIGS: Record<QuoteType, StringLiteralConfig> = {
  "'": { quoteType: "'", allowsNewlines: false, requiresEscaping: ["'"] },
  '"': { quoteType: '"', allowsNewlines: false, requiresEscaping: ['"'] },
  '`': { quoteType: '`', allowsNewlines: true, requiresEscaping: ['`'] }
};

// Parsed string literal with metadata
interface ParsedStringLiteral {
  value: string;
  originalQuoteType: QuoteType;
  containsEscapes: boolean;
}
```

### Justification
1. **Validation Simplification**: The complex validation logic in `validateLiteral()` could be simplified with type-driven validation.
2. **Reduced Duplication**: The repeated logic for different quote types can be consolidated.
3. **Better Error Messages**: Type-specific error messages would be more precise.
4. **Future Extensibility**: If new string literal formats are added, the type system makes it easier to extend.

## 3. Directive Node Type Enhancements

### Problem
The `ContentResolver.resolve()` method uses type casting and manual type checking, which is error-prone and less maintainable:

```typescript
// Current approach with manual type casting
resolvedParts.push((node as TextNode).content);
```

### Proposed Type Improvement
```typescript
// Type guard functions
function isTextNode(node: MeldNode): node is TextNode {
  return node.type === 'Text';
}

function isCodeFenceNode(node: MeldNode): node is CodeFenceNode {
  return node.type === 'CodeFence';
}

function isDefineDirectiveNode(node: MeldNode): node is DirectiveNode {
  return node.type === 'Directive' && 
         (node as any).directive?.kind === 'define';
}

// Enhanced directive node types
interface DirectiveNode extends MeldNode {
  type: 'Directive';
  directive: {
    kind: string;
    // Additional common directive properties
  };
}

interface DefineDirectiveNode extends DirectiveNode {
  directive: {
    kind: 'define';
    name: string;
    parameters: string[];
    value: RunDirectiveNode;
  };
}

interface RunDirectiveNode extends DirectiveNode {
  directive: {
    kind: 'run';
    command: string;
    args?: any[];
    language?: string;
    content: string;
  };
}
```

### Justification
1. **Type Safety**: Eliminates risky type casting with proper type guards.
2. **Self-Validating Code**: The type system itself enforces correct node structure access.
3. **Refactoring Support**: Makes future refactoring safer with compiler-checked types.
4. **Clearer Intent**: Code becomes more readable with explicit type relationships.

## 4. Resolution Context Enhancement

### Problem
The `ResolutionContext` passed to `resolve()` doesn't have specific properties for handling `@define` directives, making it harder to track resolution state.

### Proposed Type Improvement
```typescript
// Enhanced resolution context with command-specific properties
interface ResolutionContext {
  // Existing properties...
  
  // Define-specific properties
  commandResolution?: {
    activeCommand?: string;
    parameters?: Record<string, string>;
    processingLanguageBlock?: boolean;
    languageType?: 'js' | 'python' | 'bash';
  };
}
```

### Justification
1. **Contextual Awareness**: Makes resolution context aware of command processing state.
2. **Prevents Mistakes**: Helps prevent accidental variable resolution inside language blocks where it's not allowed.
3. **Simplifies Logic**: Reduces the need for complex state tracking inside the resolver.
4. **Debugging Support**: Makes it easier to debug command resolution issues with explicit state.

## Implementation Plan

To implement these improvements:

1. First, introduce the type definitions in a central location (e.g., `@core/syntax/types.ts`).
2. Update the `ContentResolver` to use the new types with proper type guards.
3. Refactor the `StringLiteralHandler` to leverage the enhanced string literal types.
4. Update the `ResolutionContext` interface to include command-specific properties.
5. Gradually migrate code that interacts with `@define` directives to use the new types.

## Benefits Summary

These type improvements would:

1. **Reduce Bugs**: Catch errors at compile time rather than runtime.
2. **Improve Readability**: Make code intentions clearer through type declarations.
3. **Enhance Maintainability**: Make future changes safer and more predictable.
4. **Support Better Testing**: Enable more precise unit tests with explicit types.
5. **Simplify Implementation**: Replace complex manual validation with type-driven validation.

The most significant improvement would be the `DefineCommandTemplate` discriminated union, which clearly separates the two different command types and their handling requirements, preventing confusion between basic command templates (which allow variable interpolation) and language command blocks (which don't).