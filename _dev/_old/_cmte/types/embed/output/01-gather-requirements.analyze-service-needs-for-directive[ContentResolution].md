# Improving the `@embed` Directive's Type System

## Current Challenges in Content Resolution

After reviewing the codebase, I've identified several areas where stronger TypeScript types for the `@embed` directive would significantly improve maintainability, type safety, and code clarity.

### 1. Embed Type Discrimination Issues

**Current Problem:**
The ContentResolver currently doesn't have specialized handling for the three distinct `@embed` directive types (path, variable, template). This leads to potential issues with content resolution since each type requires different handling for proper embedding.

**Proposed Type Solution:**
```typescript
// Discriminated union for embed directive types
type EmbedDirectiveType = 
  | { type: 'embedPath'; path: string; }
  | { type: 'embedVariable'; variable: string; fieldPath?: string[]; }
  | { type: 'embedTemplate'; content: string; }

// Strengthen directive parameters
interface EmbedDirectiveParams {
  kind: 'embed';
  embedType: EmbedDirectiveType;
  // Common properties
  location?: Location;
}
```

**Justification:**
1. **Type Safety**: A discriminated union would eliminate runtime type checking and make the different embed types explicit at compile time.
2. **Self-Documenting Code**: The types clearly communicate the three distinct embed patterns to developers.
3. **Exhaustiveness Checking**: TypeScript can enforce handling of all possible embed types in switch statements.
4. **Simplified Logic**: Removes the need for complex string pattern detection to determine embed types.

### 2. Variable Reference Handling

**Current Problem:**
The StringLiteralHandler has complex logic to detect variable references, with manual string pattern checking and multiple conditions. This is error-prone and difficult to maintain.

**Proposed Type Solution:**
```typescript
// Strong typing for variable references
interface VariableReference {
  isVariableReference: true;
  name: string;
  path?: Array<string | number>; // For object/array access
}

// Update embed variable type
type EmbedVariableType = {
  type: 'embedVariable';
  variable: VariableReference;
}
```

**Justification:**
1. **Explicit Structure**: Clearly defines what constitutes a variable reference.
2. **Path Access Support**: Built-in support for field/property access paths.
3. **Validation at Parse Time**: The parser can validate references earlier in the pipeline.
4. **Reduced Duplication**: Eliminates duplicated validation logic across services.

### 3. Template Content Type Safety

**Current Problem:**
Template content handling relies on string manipulation and pattern detection, making it brittle and prone to errors.

**Proposed Type Solution:**
```typescript
// Strong typing for template content
interface TemplateContent {
  isTemplateContent: true;
  rawContent: string;
  variables: VariableReference[];
}

// Update embed template type
type EmbedTemplateType = {
  type: 'embedTemplate';
  content: TemplateContent;
}
```

**Justification:**
1. **Pre-parsed Variables**: Variables in templates can be pre-parsed at the AST level.
2. **Explicit Variable List**: Makes dependencies clear for resolution and circularity checking.
3. **First-newline Handling**: Template formatting rules can be enforced at the type level.
4. **Improved Performance**: Reduces need for repeated string scanning during resolution.

### 4. Resolution Context Type Safety

**Current Problem:**
The ContentResolver doesn't have specialized context handling for embed directives, which is necessary to prevent path prefixing for variable embeds.

**Proposed Type Solution:**
```typescript
// Enhanced resolution context
interface EmbedResolutionContext extends ResolutionContext {
  embedType: 'path' | 'variable' | 'template';
  disablePathPrefixing: boolean;
  preventPathPrefixing: boolean;
  allowedVariableTypes: {
    path: boolean;
    text: boolean;
    data: boolean;
  };
}

// Factory function type
type ResolutionContextFactory = {
  forVariableEmbed(currentPath: string, state: IStateService): EmbedResolutionContext;
  forPathEmbed(currentPath: string, state: IStateService): EmbedResolutionContext;
  forTemplateEmbed(currentPath: string, state: IStateService): EmbedResolutionContext;
}
```

**Justification:**
1. **Context-Aware Resolution**: Makes resolution behavior explicit for each embed type.
2. **Prevents Path Prefixing Bugs**: Ensures variable embeds don't get unexpected path prefixing.
3. **Type-Safe Factory Methods**: Creates appropriate contexts for each embed type.
4. **Self-Documenting API**: Makes the differences between embed types explicit in the API.

### 5. String Literal Validation

**Current Problem:**
The StringLiteralHandler uses complex manual validation with many edge cases and fallbacks.

**Proposed Type Solution:**
```typescript
// String literal type with validation metadata
interface StringLiteral {
  type: 'StringLiteral';
  value: string;
  quoteType: "'" | '"' | '`';
  isValid: boolean;
  validationErrors?: string[];
}

// Parser service enhancement
interface IParserService {
  // Existing methods
  parse(content: string): Promise<MeldNode[]>;
  
  // New method for literal validation
  parseStringLiteral(literal: string): Promise<StringLiteral>;
}
```

**Justification:**
1. **Centralized Validation**: Moves validation logic to the parser where it belongs.
2. **Early Validation**: Catches errors earlier in the pipeline.
3. **Rich Error Information**: Provides detailed validation errors.
4. **Reduced Duplication**: Eliminates separate validation implementations.

## Implementation Recommendations

To implement these improvements, I recommend:

1. **Update the AST parser** to recognize and properly type the three embed directive forms.
2. **Enhance the ContentResolver** to utilize the new type information.
3. **Create specialized resolution context factories** for each embed type.
4. **Update StringLiteralHandler** to leverage the parser's enhanced typing.
5. **Add unit tests** that verify correct handling of each embed type.

## Benefits Summary

These type improvements would:

1. **Reduce Code Complexity**: Replace complex string manipulation and pattern matching with simple type checking.
2. **Improve Type Safety**: Catch more errors at compile time rather than runtime.
3. **Enhance Developer Experience**: Make the code more self-documenting and easier to understand.
4. **Simplify Testing**: Allow more focused testing of each embed type.
5. **Support Future Extensions**: Provide a flexible foundation for adding new embed features.

By implementing these type enhancements, the ContentResolution service would become more robust, maintainable, and easier to extend in the future.