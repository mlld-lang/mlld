# Type Improvements for the `embed` Directive

After examining the DirectiveService code, particularly the `EmbedDirectiveHandler`, I've identified several areas where stronger TypeScript types could simplify our implementation and improve safety.

## Current Pain Points

The current implementation of the `embed` directive handler has several areas where manual validation and complex logic are required:

1. **Source Type Determination**: We manually distinguish between file paths and variable references
2. **Configuration Validation**: Complex validation for options like `format` and `range`
3. **Error Handling**: Specific error cases for each potential issue with embedding
4. **Type Ambiguity**: Lack of clear typing for what can be embedded

## Proposed Type Improvements

### 1. Discriminated Union for Source Types

```typescript
type EmbedDirectiveSource = 
  | { type: 'file'; path: string; }
  | { type: 'variable'; name: string; };

interface EmbedDirective {
  source: EmbedDirectiveSource;
  // other properties...
}
```

**Justification**: This would eliminate the need for runtime checks to determine if we're dealing with a file path or variable reference. The handler could use type guards to safely handle each case distinctly, reducing conditional logic and improving code clarity.

### 2. Strongly Typed Range Configuration

```typescript
type LineRange = 
  | { type: 'single'; line: number; }
  | { type: 'span'; start: number; end: number; }
  | { type: 'startToEnd'; start: number; }
  | { type: 'startToCount'; start: number; count: number; };

interface EmbedDirectiveOptions {
  range?: LineRange;
  // other options...
}
```

**Justification**: Range handling is complex with many edge cases. A strongly typed approach would ensure all range formats are handled consistently and would prevent invalid combinations (like specifying both `end` and `count`).

### 3. Format Literal Types

```typescript
type SupportedFormat = 'text' | 'markdown' | 'code' | 'json';

interface EmbedDirectiveOptions {
  format?: SupportedFormat;
  // other options...
}
```

**Justification**: This would eliminate runtime validation of format values and provide better IDE support. It would also make it clear to users what formats are supported without having to check documentation.

### 4. Complete Directive Type

```typescript
interface EmbedDirective {
  source: EmbedDirectiveSource;
  options?: {
    range?: LineRange;
    format?: SupportedFormat;
    language?: string;
    trim?: boolean;
  };
}
```

**Justification**: A comprehensive type would ensure all options are properly documented and validated. It would reduce the need for manual property checking and provide clear guidance to consumers of the API.

### 5. Result Type Definition

```typescript
interface EmbedResult {
  content: string;
  metadata: {
    source: string;
    format: SupportedFormat;
    lineCount: number;
    charCount: number;
  };
}
```

**Justification**: Defining the return type would clarify what consumers can expect from the directive handler and ensure consistent results.

## Benefits to DirectiveService

1. **Reduced Validation Logic**: With proper type constraints, much of our manual validation can be eliminated, making the code more concise.

2. **Better Error Messages**: TypeScript can catch more issues at compile time, providing specific error messages when directive usage doesn't match the expected types.

3. **Self-Documenting Code**: The types themselves serve as documentation, making it clear what the `embed` directive accepts and returns.

4. **Safer Refactoring**: When changes are needed, the type system will guide us to update all relevant code paths.

5. **Improved IDE Support**: Developers will get better autocompletion and inline documentation when working with the `embed` directive.

## Implementation Impact

These type improvements would primarily affect:
- `EmbedDirectiveHandler.ts`
- `EmbedDirectiveHandler.transformation.test.ts`
- `EmbedDirectiveHandler.test.ts`
- `EmbedDirectiveHandler.config.test.ts`

The changes would simplify these files by reducing conditional logic and manual validation, making the code more maintainable and less prone to bugs.