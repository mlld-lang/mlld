# Variable Resolution Helpers Specification

## Overview

This document specifies a centralized system for variable resolution, validation, and value extraction to eliminate the repeated patterns of variable access throughout the interpreter codebase.

## Problem Statement

Currently, variable resolution logic is repeated 30+ times across the codebase with patterns like:

```typescript
const variable = env.getVariable(varName);
if (!variable) {
  throw new Error(`Variable not found: ${varName}`);
}

// Type checking scattered everywhere
if (isTextLike(variable)) {
  value = variable.value;
} else if (isObject(variable)) {
  value = variable.value;
} else {
  throw new Error(`Unsupported variable type: ${variable.type}`);
}
```

This leads to:
1. **Inconsistent error messages** - Different wording for same errors
2. **Missing context** - Errors don't always include helpful debugging info
3. **Code duplication** - Same patterns repeated with slight variations
4. **Maintenance burden** - Updates must be made in many places

## Proposed Solution

### Core Architecture

```typescript
// interpreter/utils/variable-resolution.ts
export interface VariableResolutionOptions {
  allowUndefined?: boolean;
  expectedTypes?: VariableType[];
  context?: string;
  location?: SourceLocation;
}

export interface VariableExtractionOptions {
  unwrapLoadContent?: boolean;
  resolveExecutables?: boolean;
  preserveMetadata?: boolean;
}
```

### Implementation

```typescript
// interpreter/utils/variable-resolution.ts

/**
 * Requires a variable to exist, throws descriptive error if not found
 */
export function requireVariable(
  env: Environment,
  name: string,
  options: VariableResolutionOptions = {}
): Variable {
  const variable = env.getVariable(name);
  
  if (!variable) {
    if (options.allowUndefined) {
      return createUndefinedVariable(name);
    }
    
    throw new VariableResolutionError({
      name,
      context: options.context,
      location: options.location,
      availableVariables: env.getAvailableVariableNames(),
      suggestion: findSimilarVariableName(name, env)
    });
  }
  
  // Type validation if specified
  if (options.expectedTypes && options.expectedTypes.length > 0) {
    if (!options.expectedTypes.includes(variable.type)) {
      throw new VariableTypeError({
        name,
        actualType: variable.type,
        expectedTypes: options.expectedTypes,
        context: options.context,
        location: options.location
      });
    }
  }
  
  return variable;
}

/**
 * Gets a variable or returns undefined (no throwing)
 */
export function getVariable(
  env: Environment,
  name: string,
  options: VariableResolutionOptions = {}
): Variable | undefined {
  try {
    return requireVariable(env, { ...options, allowUndefined: true });
  } catch {
    return undefined;
  }
}

/**
 * Extracts the value from a variable with proper type handling
 */
export function extractVariableValue(
  variable: Variable,
  options: VariableExtractionOptions = {}
): any {
  // Handle LoadContentResult unwrapping
  if (options.unwrapLoadContent && isLoadContentResult(variable.value)) {
    return variable.value.content;
  }
  
  // Handle executable resolution
  if (options.resolveExecutables && variable.type === 'executable') {
    throw new Error('Executable resolution requires environment context');
  }
  
  // Standard value extraction
  switch (variable.type) {
    case 'text':
    case 'number':
    case 'boolean':
    case 'path':
      return variable.value;
      
    case 'object':
      return options.preserveMetadata 
        ? { ...variable.value, __metadata: variable.metadata }
        : variable.value;
        
    case 'array':
      return variable.value;
      
    case 'executable':
      // Return the executable definition
      return variable;
      
    default:
      return variable.value;
  }
}

/**
 * Resolves a variable to a string value (common pattern)
 */
export async function resolveVariableToString(
  env: Environment,
  name: string,
  options: VariableResolutionOptions = {}
): Promise<string> {
  const variable = requireVariable(env, name, {
    ...options,
    expectedTypes: ['text', 'path', 'number', 'boolean']
  });
  
  const value = extractVariableValue(variable, { unwrapLoadContent: true });
  
  // Convert to string based on type
  switch (variable.type) {
    case 'text':
    case 'path':
      return String(value);
    case 'number':
    case 'boolean':
      return String(value);
    default:
      throw new VariableTypeError({
        name,
        actualType: variable.type,
        expectedTypes: ['text', 'path', 'number', 'boolean'],
        context: 'string conversion'
      });
  }
}

/**
 * Batch variable resolution
 */
export async function resolveVariables(
  env: Environment,
  names: string[],
  options: VariableResolutionOptions = {}
): Promise<Map<string, Variable>> {
  const results = new Map<string, Variable>();
  const errors: Error[] = [];
  
  for (const name of names) {
    try {
      results.set(name, requireVariable(env, name, options));
    } catch (error) {
      if (!options.allowUndefined) {
        errors.push(error as Error);
      }
    }
  }
  
  if (errors.length > 0) {
    throw new MultipleVariableResolutionError(errors);
  }
  
  return results;
}

/**
 * Type-safe variable access helpers
 */
export const VariableResolvers = {
  text: (env: Environment, name: string, options?: VariableResolutionOptions) =>
    requireVariable(env, name, { ...options, expectedTypes: ['text'] }),
    
  number: (env: Environment, name: string, options?: VariableResolutionOptions) =>
    requireVariable(env, name, { ...options, expectedTypes: ['number'] }),
    
  boolean: (env: Environment, name: string, options?: VariableResolutionOptions) =>
    requireVariable(env, name, { ...options, expectedTypes: ['boolean'] }),
    
  object: (env: Environment, name: string, options?: VariableResolutionOptions) =>
    requireVariable(env, name, { ...options, expectedTypes: ['object'] }),
    
  array: (env: Environment, name: string, options?: VariableResolutionOptions) =>
    requireVariable(env, name, { ...options, expectedTypes: ['array'] }),
    
  executable: (env: Environment, name: string, options?: VariableResolutionOptions) =>
    requireVariable(env, name, { ...options, expectedTypes: ['executable'] }),
    
  path: (env: Environment, name: string, options?: VariableResolutionOptions) =>
    requireVariable(env, name, { ...options, expectedTypes: ['path'] })
};
```

### Error Types

```typescript
// interpreter/utils/errors/variable-errors.ts

export class VariableResolutionError extends MlldError {
  constructor(details: {
    name: string;
    context?: string;
    location?: SourceLocation;
    availableVariables?: string[];
    suggestion?: string;
  }) {
    const message = `Variable '${details.name}' not found${
      details.context ? ` in ${details.context}` : ''
    }`;
    
    super(message, details.location, {
      severity: ErrorSeverity.Error,
      code: 'VARIABLE_NOT_FOUND',
      details: {
        variableName: details.name,
        context: details.context,
        availableVariables: details.availableVariables,
        suggestion: details.suggestion
      }
    });
  }
}

export class VariableTypeError extends MlldError {
  constructor(details: {
    name: string;
    actualType: VariableType;
    expectedTypes: VariableType[];
    context?: string;
    location?: SourceLocation;
  }) {
    const expected = details.expectedTypes.length === 1
      ? details.expectedTypes[0]
      : `one of: ${details.expectedTypes.join(', ')}`;
      
    const message = `Variable '${details.name}' has type '${details.actualType}' but expected ${expected}${
      details.context ? ` for ${details.context}` : ''
    }`;
    
    super(message, details.location, {
      severity: ErrorSeverity.Error,
      code: 'VARIABLE_TYPE_MISMATCH',
      details
    });
  }
}

export class MultipleVariableResolutionError extends MlldError {
  constructor(errors: Error[]) {
    super(
      `Failed to resolve ${errors.length} variables`,
      undefined,
      {
        severity: ErrorSeverity.Error,
        code: 'MULTIPLE_VARIABLE_ERRORS',
        details: { errors }
      }
    );
  }
}
```

### Helper Utilities

```typescript
// interpreter/utils/variable-helpers.ts

/**
 * Find similar variable names for suggestions
 */
export function findSimilarVariableName(
  name: string,
  env: Environment,
  maxDistance: number = 3
): string | undefined {
  const available = env.getAvailableVariableNames();
  let bestMatch: string | undefined;
  let bestDistance = maxDistance + 1;
  
  for (const candidate of available) {
    const distance = levenshteinDistance(name, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = candidate;
    }
  }
  
  return bestMatch;
}

/**
 * Create an undefined variable placeholder
 */
export function createUndefinedVariable(name: string): Variable {
  return {
    type: 'undefined',
    name,
    value: undefined,
    source: 'resolution' as VariableSource,
    metadata: {
      isPlaceholder: true,
      createdAt: new Date().toISOString()
    }
  };
}

/**
 * Check if a variable contains a "real" value
 */
export function hasDefinedValue(variable: Variable): boolean {
  return variable.type !== 'undefined' && 
         variable.value !== undefined &&
         variable.value !== null &&
         !variable.metadata?.isPlaceholder;
}
```

## Integration Examples

### Before:
```typescript
// show.ts
const variable = env.getVariable(varName);
if (!variable) {
  throw new Error(`Variable not found: ${varName}`);
}

let value: string;
if (isTextLike(variable)) {
  value = String(variable.value);
} else {
  throw new Error(`Cannot show non-text variable: ${varName}`);
}
```

### After:
```typescript
// show.ts
const value = await resolveVariableToString(env, varName, {
  context: 'show directive',
  location: directive.location
});
```

### Before:
```typescript
// exec-invocation.ts
const targetVar = env.getVariable(targetName);
if (!targetVar || targetVar.type !== 'executable') {
  throw new Error(`Executable not found: ${targetName}`);
}
```

### After:
```typescript
// exec-invocation.ts
const targetVar = VariableResolvers.executable(env, targetName, {
  context: 'exec invocation',
  location: directive.location
});
```

## Migration Strategy

### Phase 1: Implementation
1. Create the variable resolution module
2. Implement all helper functions
3. Add comprehensive tests

### Phase 2: Gradual Migration
1. Update one evaluator at a time
2. Run tests after each update
3. Keep old patterns working during transition

### Phase 3: Cleanup
1. Remove duplicated resolution code
2. Update documentation
3. Add lint rules to enforce usage

## Benefits

1. **Consistent Error Messages** - All variable errors have same format
2. **Better Debugging** - Errors include context and suggestions
3. **Type Safety** - Type-specific resolvers prevent type errors
4. **Less Code** - Replace 5-10 lines with 1 line
5. **Maintainability** - Single place to update resolution logic
6. **Performance** - Can add caching if needed

## Testing Strategy

```typescript
// Test comprehensive error scenarios
describe('Variable Resolution', () => {
  it('should throw descriptive error for missing variable', () => {
    const error = requireVariable(env, 'missing');
    expect(error.code).toBe('VARIABLE_NOT_FOUND');
    expect(error.details.suggestion).toBe('existing_var');
  });
  
  it('should validate expected types', () => {
    env.setVariable(createTextVariable('myVar', 'value'));
    expect(() => VariableResolvers.number(env, 'myVar'))
      .toThrow('VARIABLE_TYPE_MISMATCH');
  });
});
```

## Future Enhancements

1. **Async Resolution** - Support for async variable providers
2. **Lazy Resolution** - Resolve only when accessed
3. **Resolution Context** - Track resolution chain for debugging
4. **Performance Monitoring** - Track slow resolutions
5. **Caching** - Cache frequently accessed variables