# AST Extraction Utilities Specification

## Overview

This document specifies a centralized system for extracting and validating nodes from the mlld AST, eliminating the complex and error-prone extraction patterns repeated throughout the codebase.

## Problem Statement

Current AST node extraction involves complex, repetitive patterns:

```typescript
// This pattern appears 20+ times
const identifierNodes = directive.values?.identifier as VariableNodeArray | undefined;
if (!identifierNodes || !Array.isArray(identifierNodes) || identifierNodes.length === 0) {
  throw new Error('Var directive missing identifier');
}
const identifierNode = identifierNodes[0];
if (!isVariableNode(identifierNode)) {
  throw new Error('Invalid identifier node');
}

// Complex nested extraction
const commandNodes = directive.values?.command;
if (!commandNodes || !Array.isArray(commandNodes)) {
  throw new Error('Missing command');
}
```

Issues:
1. **Verbose extraction** - Simple extractions require many lines
2. **Inconsistent validation** - Different checks in different places  
3. **Poor error messages** - Generic errors without context
4. **Type safety issues** - Lots of type assertions
5. **No null safety** - Easy to miss edge cases

## Proposed Solution

### Core Architecture

```typescript
// interpreter/utils/ast-extraction.ts

export interface ExtractionOptions {
  required?: boolean;
  allowEmpty?: boolean;
  expectedCount?: number | { min?: number; max?: number };
  validateWith?: (node: any) => boolean;
  errorContext?: string;
  location?: SourceLocation;
}

export interface ExtractedNode<T> {
  value: T;
  raw: any;
  path: string;
}
```

### Primary Extraction Functions

```typescript
// interpreter/utils/ast-extraction.ts

/**
 * Extract a required node from directive values
 */
export function extractRequiredNode<T extends MlldNode>(
  directive: DirectiveNode,
  key: string,
  validator: (node: any) => node is T,
  options: ExtractionOptions = {}
): T {
  const nodes = extractNodes(directive, key, validator, {
    ...options,
    required: true,
    expectedCount: 1
  });
  return nodes[0];
}

/**
 * Extract optional node from directive values
 */
export function extractOptionalNode<T extends MlldNode>(
  directive: DirectiveNode,
  key: string,
  validator: (node: any) => node is T,
  options: ExtractionOptions = {}
): T | undefined {
  const nodes = extractNodes(directive, key, validator, {
    ...options,
    required: false
  });
  return nodes[0];
}

/**
 * Extract array of nodes
 */
export function extractNodes<T extends MlldNode>(
  directive: DirectiveNode,
  key: string,
  validator: (node: any) => node is T,
  options: ExtractionOptions = {}
): T[] {
  const rawValue = directive.values?.[key];
  
  if (!rawValue) {
    if (options.required) {
      throw new ASTExtractionError({
        directive: directive.kind,
        field: key,
        reason: 'missing required field',
        location: options.location || directive.location,
        context: options.errorContext
      });
    }
    return [];
  }
  
  // Normalize to array
  const nodes = Array.isArray(rawValue) ? rawValue : [rawValue];
  
  // Filter and validate
  const validNodes: T[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    
    // Skip whitespace/newline nodes unless explicitly wanted
    if (isWhitespaceNode(node) && !options.allowEmpty) {
      continue;
    }
    
    if (!validator(node)) {
      throw new ASTExtractionError({
        directive: directive.kind,
        field: key,
        reason: `invalid node type at index ${i}`,
        expected: validator.name || 'valid node',
        actual: node?.type || 'unknown',
        location: node?.location || directive.location,
        context: options.errorContext
      });
    }
    
    validNodes.push(node);
  }
  
  // Validate count constraints
  if (options.expectedCount !== undefined) {
    const count = validNodes.length;
    const expected = options.expectedCount;
    
    if (typeof expected === 'number') {
      if (count !== expected) {
        throw new ASTExtractionError({
          directive: directive.kind,
          field: key,
          reason: `expected exactly ${expected} nodes, got ${count}`,
          location: directive.location,
          context: options.errorContext
        });
      }
    } else {
      if (expected.min !== undefined && count < expected.min) {
        throw new ASTExtractionError({
          directive: directive.kind,
          field: key,
          reason: `expected at least ${expected.min} nodes, got ${count}`,
          location: directive.location,
          context: options.errorContext
        });
      }
      if (expected.max !== undefined && count > expected.max) {
        throw new ASTExtractionError({
          directive: directive.kind,
          field: key,
          reason: `expected at most ${expected.max} nodes, got ${count}`,
          location: directive.location,
          context: options.errorContext
        });
      }
    }
  }
  
  return validNodes;
}
```

### Specialized Extractors

```typescript
// Common extraction patterns as dedicated functions

export const ASTExtractors = {
  /**
   * Extract identifier (variable name)
   */
  identifier(directive: DirectiveNode, options?: ExtractionOptions): VariableNode {
    return extractRequiredNode(
      directive,
      'identifier',
      isVariableNode,
      { ...options, errorContext: 'identifier extraction' }
    );
  },
  
  /**
   * Extract optional identifier
   */
  optionalIdentifier(directive: DirectiveNode, options?: ExtractionOptions): VariableNode | undefined {
    return extractOptionalNode(
      directive,
      'identifier',
      isVariableNode,
      options
    );
  },
  
  /**
   * Extract command nodes for interpolation
   */
  commandNodes(directive: DirectiveNode, options?: ExtractionOptions): MlldNode[] {
    return extractNodes(
      directive,
      'command',
      isMlldNode,
      { ...options, required: true, errorContext: 'command extraction' }
    );
  },
  
  /**
   * Extract value assignment nodes
   */
  valueNodes(directive: DirectiveNode, options?: ExtractionOptions): MlldNode[] {
    return extractNodes(
      directive,
      'value',
      isMlldNode,
      { ...options, required: true, errorContext: 'value extraction' }
    );
  },
  
  /**
   * Extract template content
   */
  templateContent(directive: DirectiveNode, options?: ExtractionOptions): TemplateContentNode[] {
    return extractNodes(
      directive,
      'templateContent',
      isTemplateContentNode,
      { ...options, required: true, errorContext: 'template content' }
    );
  },
  
  /**
   * Extract with clause
   */
  withClause(directive: DirectiveNode, options?: ExtractionOptions): WithClause | undefined {
    const clauses = extractNodes(
      directive,
      'withClause',
      isWithClause,
      { ...options, required: false, expectedCount: { max: 1 } }
    );
    return clauses[0];
  },
  
  /**
   * Extract variable reference with fields
   */
  variableReference(directive: DirectiveNode, options?: ExtractionOptions): VariableReference {
    const refs = extractNodes(
      directive,
      'variable',
      isVariableReference,
      { ...options, required: true, expectedCount: 1 }
    );
    return refs[0];
  },
  
  /**
   * Extract data value (for @data directives)
   */
  dataValue(directive: DirectiveNode, options?: ExtractionOptions): DataValue {
    const values = extractNodes(
      directive,
      'value',
      isDataValue,
      { ...options, required: true, expectedCount: 1 }
    );
    return values[0];
  }
};
```

### Complex Extraction Helpers

```typescript
/**
 * Extract and validate multiple fields at once
 */
export function extractDirectiveFields<T extends Record<string, any>>(
  directive: DirectiveNode,
  schema: {
    [K in keyof T]: {
      key: string;
      validator: (node: any) => boolean;
      required?: boolean;
      options?: ExtractionOptions;
    }
  }
): T {
  const result = {} as T;
  
  for (const [field, config] of Object.entries(schema)) {
    if (config.required) {
      result[field as keyof T] = extractRequiredNode(
        directive,
        config.key,
        config.validator,
        config.options
      );
    } else {
      result[field as keyof T] = extractOptionalNode(
        directive,
        config.key,
        config.validator,
        config.options
      );
    }
  }
  
  return result;
}

/**
 * Safe property access with type validation
 */
export function extractProperty<T>(
  node: any,
  path: string,
  validator?: (value: any) => value is T,
  defaultValue?: T
): T {
  const parts = path.split('.');
  let current = node;
  
  for (const part of parts) {
    if (!current || typeof current !== 'object') {
      if (defaultValue !== undefined) return defaultValue;
      throw new Error(`Cannot access property '${part}' of ${typeof current}`);
    }
    current = current[part];
  }
  
  if (validator && !validator(current)) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Property '${path}' failed validation`);
  }
  
  return current as T;
}
```

### Error Handling

```typescript
// interpreter/utils/errors/ast-errors.ts

export class ASTExtractionError extends MlldError {
  constructor(details: {
    directive: string;
    field: string;
    reason: string;
    expected?: string;
    actual?: string;
    location?: SourceLocation;
    context?: string;
  }) {
    const message = `Failed to extract '${details.field}' from @${details.directive}: ${details.reason}`;
    
    super(message, details.location, {
      severity: ErrorSeverity.Error,
      code: 'AST_EXTRACTION_ERROR',
      details: {
        ...details,
        hint: generateExtractionHint(details)
      }
    });
  }
}

function generateExtractionHint(details: any): string {
  if (details.reason.includes('missing required')) {
    return `Make sure your @${details.directive} directive includes the ${details.field} field`;
  }
  if (details.expected && details.actual) {
    return `Expected ${details.expected} but got ${details.actual}`;
  }
  return '';
}
```

### Validation Helpers

```typescript
// interpreter/utils/ast-validation.ts

/**
 * Create a validator that checks multiple conditions
 */
export function combineValidators<T>(
  ...validators: Array<(node: any) => node is T>
): (node: any) => node is T {
  return (node: any): node is T => {
    return validators.every(v => v(node));
  };
}

/**
 * Create a validator for specific node shapes
 */
export function shapeValidator<T>(shape: {
  [K in keyof T]: (value: any) => boolean
}): (node: any) => node is T {
  return (node: any): node is T => {
    if (!node || typeof node !== 'object') return false;
    
    for (const [key, validator] of Object.entries(shape)) {
      if (!validator(node[key])) return false;
    }
    
    return true;
  };
}

/**
 * Common validator combinations
 */
export const Validators = {
  nonEmptyArray: (arr: any): arr is any[] => 
    Array.isArray(arr) && arr.length > 0,
    
  stringValue: (val: any): val is string => 
    typeof val === 'string' && val.length > 0,
    
  nodeWithType: (type: string) => (node: any): boolean =>
    node && typeof node === 'object' && node.type === type,
    
  oneOf: <T>(...validators: Array<(v: any) => v is T>) => (value: any): value is T =>
    validators.some(v => v(value))
};
```

## Integration Examples

### Before:
```typescript
// var.ts
const identifierNodes = directive.values?.identifier as VariableNodeArray | undefined;
if (!identifierNodes || !Array.isArray(identifierNodes) || identifierNodes.length === 0) {
  throw new Error('Var directive missing identifier');
}
const identifierNode = identifierNodes[0];
if (!isVariableNode(identifierNode)) {
  throw new Error('Invalid identifier in var directive');
}
const varName = identifierNode.value;

const valueNodes = directive.values?.value;
if (!valueNodes || !Array.isArray(valueNodes)) {
  throw new Error('Var directive missing value');
}
```

### After:
```typescript
// var.ts
const identifierNode = ASTExtractors.identifier(directive);
const varName = identifierNode.value;
const valueNodes = ASTExtractors.valueNodes(directive);
```

### Before:
```typescript
// Complex extraction with validation
const command = directive.values?.command;
if (!command) {
  throw new Error('Missing command');
}
const commandArray = Array.isArray(command) ? command : [command];
const validCommands = commandArray.filter(node => 
  node && node.type !== 'Whitespace' && node.type !== 'Newline'
);
if (validCommands.length === 0) {
  throw new Error('No valid command nodes');
}
```

### After:
```typescript
// Complex extraction simplified
const commandNodes = ASTExtractors.commandNodes(directive, {
  allowEmpty: false,
  expectedCount: { min: 1 }
});
```

## Migration Strategy

### Phase 1: Implementation
1. Create ast-extraction module
2. Implement core extraction functions
3. Add specialized extractors for common patterns
4. Create comprehensive test suite

### Phase 2: Gradual Adoption
1. Update one evaluator at a time
2. Replace complex extractions first
3. Verify error messages remain helpful

### Phase 3: Enforcement
1. Add ESLint rules to catch manual extraction
2. Update developer documentation
3. Remove old extraction utilities

## Benefits

1. **Concise Code** - Replace 10+ lines with 1 line
2. **Better Errors** - Consistent, informative error messages
3. **Type Safety** - Proper type inference without assertions
4. **Validation** - Built-in validation with good defaults
5. **Maintainability** - Single place to update extraction logic
6. **Discoverability** - Developers can browse available extractors

## Testing Strategy

```typescript
describe('AST Extraction', () => {
  it('should extract required nodes with validation', () => {
    const directive = createDirective('var', {
      identifier: [createVariableNode('myVar')]
    });
    
    const id = ASTExtractors.identifier(directive);
    expect(id.value).toBe('myVar');
  });
  
  it('should provide helpful errors for missing fields', () => {
    const directive = createDirective('var', {});
    
    expect(() => ASTExtractors.identifier(directive))
      .toThrow(/Failed to extract 'identifier'.*missing required field/);
  });
  
  it('should validate node types', () => {
    const directive = createDirective('var', {
      identifier: [createTextNode('not a variable')]
    });
    
    expect(() => ASTExtractors.identifier(directive))
      .toThrow(/invalid node type/);
  });
});
```

## Future Enhancements

1. **Path-based extraction** - Extract nested values with paths like "values.command[0].value"
2. **Schema validation** - Define directive schemas for automatic validation
3. **Error recovery** - Provide defaults or alternatives when extraction fails
4. **Performance optimization** - Cache extraction results for repeated access
5. **AST transformation** - Helpers to safely transform AST nodes