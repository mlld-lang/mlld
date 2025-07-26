# Field Access Resolver Specification

## ⚠️ REFINEMENT NEEDED

### Critical Concerns:
1. **Method Execution is Risky** - The current spec allows arbitrary method calls which poses security risks
2. **Over-Complex Design** - Trying to handle too many access patterns in one utility
3. **Argument Resolution** - Method argument handling adds significant complexity

### Recommended Changes:
1. **Remove Method Support Initially** - Focus only on property and array access
2. **Simplify Optional Chaining** - Make it more explicit rather than automatic
3. **Reduce Feature Set** - Start with basic field access, add features incrementally
4. **Security First** - Ensure no arbitrary code execution paths

### Implementation Priority:
- This should be implemented AFTER the simpler utilities are proven
- Consider splitting into separate utilities:
  - BasicFieldAccessor (properties/arrays only)
  - MethodInvoker (if needed later, with strict security controls)

---

## Overview

This document specifies a unified field access resolution system to handle object property access, array indexing, and method calls consistently throughout the mlld interpreter.

## Problem Statement

Field access logic is duplicated across multiple files with inconsistent behavior:

```typescript
// Pattern in show.ts
if (variableNode.fields && variableNode.fields.length > 0) {
  const { accessField } = await import('../utils/field-access');
  for (const field of variableNode.fields) {
    value = await accessField(value, field, env);
  }
}

// Pattern in var.ts
if (sourceRef.fields && sourceRef.fields.length > 0) {
  for (const field of sourceRef.fields) {
    result = await accessField(result, field, env);
  }
}

// Pattern in VariableReferenceEvaluator.ts
let result = value;
if (node.fields) {
  for (const field of node.fields) {
    result = await accessField(result, field, env);
  }
}
```

Issues:
1. **Duplicated loops** - Same field iteration logic everywhere
2. **Inconsistent error handling** - Different error messages for same failures
3. **No type safety** - Field access results not properly typed
4. **Performance** - No optimization for repeated access patterns
5. **Limited features** - No support for optional chaining, defaults, etc.

## Proposed Solution

### Core Architecture

```typescript
// interpreter/utils/field-access-resolver.ts

export interface FieldAccessOptions {
  // Behavior options
  optional?: boolean;              // Like ?. operator
  defaultValue?: any;              // Return if access fails
  throwOnMissing?: boolean;        // Throw error if field missing
  
  // Context for errors
  context?: string;
  location?: SourceLocation;
  variableName?: string;
  
  // Advanced features
  allowMethods?: boolean;          // Allow method calls
  allowPrivate?: boolean;          // Allow _private fields
  transformResult?: (value: any) => any;
  validateResult?: (value: any) => boolean;
}

export interface FieldAccessResult<T = any> {
  value: T;
  path: string[];
  found: boolean;
  isMethod: boolean;
  metadata?: Record<string, any>;
}

export interface FieldChain {
  fields: FieldAccess[];
  source: string;
}
```

### Primary Resolver

```typescript
// interpreter/utils/field-access-resolver.ts

export class FieldAccessResolver {
  /**
   * Resolve a chain of field accesses
   */
  static async resolve<T = any>(
    source: any,
    fields: FieldAccess[],
    env: Environment,
    options: FieldAccessOptions = {}
  ): Promise<T> {
    if (!fields || fields.length === 0) {
      return source as T;
    }
    
    let current = source;
    const path: string[] = [];
    
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const isLast = i === fields.length - 1;
      
      try {
        const result = await this.resolveField(
          current,
          field,
          env,
          {
            ...options,
            path,
            isLast
          }
        );
        
        current = result.value;
        path.push(result.resolvedName);
        
        // Validate intermediate results
        if (!isLast && current == null && !options.optional) {
          throw new FieldAccessError({
            path: path.join('.'),
            field: field.name,
            reason: 'Intermediate value is null or undefined',
            source: options.variableName,
            location: field.location || options.location
          });
        }
        
      } catch (error: any) {
        if (options.optional) {
          return (options.defaultValue ?? undefined) as T;
        }
        
        if (error instanceof FieldAccessError) {
          throw error;
        }
        
        throw new FieldAccessError({
          path: path.join('.'),
          field: field.name,
          reason: error.message,
          source: options.variableName,
          location: field.location || options.location,
          cause: error
        });
      }
    }
    
    // Transform result if requested
    if (options.transformResult) {
      current = options.transformResult(current);
    }
    
    // Validate final result
    if (options.validateResult && !options.validateResult(current)) {
      throw new FieldAccessError({
        path: path.join('.'),
        reason: 'Result failed validation',
        source: options.variableName,
        location: options.location
      });
    }
    
    return current as T;
  }
  
  /**
   * Resolve a single field access
   */
  private static async resolveField(
    source: any,
    field: FieldAccess,
    env: Environment,
    options: FieldAccessOptions & { path: string[]; isLast: boolean }
  ): Promise<{ value: any; resolvedName: string }> {
    // Handle null/undefined source
    if (source == null) {
      if (options.optional) {
        return { value: undefined, resolvedName: field.name };
      }
      throw new Error(`Cannot access field '${field.name}' of ${source}`);
    }
    
    // Resolve field name (might contain interpolation)
    const fieldName = await this.resolveFieldName(field, env);
    
    // Check access permissions
    if (!options.allowPrivate && fieldName.startsWith('_')) {
      throw new Error(`Access to private field '${fieldName}' is not allowed`);
    }
    
    // Handle different source types
    if (Array.isArray(source)) {
      return this.resolveArrayAccess(source, fieldName, field);
    } else if (isLoadContentResult(source)) {
      // Auto-unwrap LoadContentResult
      return this.resolveField(source.content, field, env, options);
    } else if (typeof source === 'object') {
      return this.resolveObjectAccess(source, fieldName, field, env, options);
    } else {
      throw new Error(
        `Cannot access field '${fieldName}' of ${typeof source} value`
      );
    }
  }
  
  /**
   * Resolve array access (numeric or special fields)
   */
  private static resolveArrayAccess(
    array: any[],
    fieldName: string,
    field: FieldAccess
  ): { value: any; resolvedName: string } {
    // Special array properties
    if (fieldName === 'length') {
      return { value: array.length, resolvedName: 'length' };
    }
    
    if (fieldName === 'first') {
      return { value: array[0], resolvedName: 'first' };
    }
    
    if (fieldName === 'last') {
      return { value: array[array.length - 1], resolvedName: 'last' };
    }
    
    // Numeric index
    const index = parseInt(fieldName, 10);
    if (!isNaN(index)) {
      // Support negative indexing
      const actualIndex = index < 0 ? array.length + index : index;
      
      if (actualIndex < 0 || actualIndex >= array.length) {
        throw new Error(
          `Array index ${index} out of bounds for array of length ${array.length}`
        );
      }
      
      return { value: array[actualIndex], resolvedName: `[${index}]` };
    }
    
    // Array methods
    if (typeof array[fieldName as keyof Array<any>] === 'function') {
      throw new Error(
        `Array method '${fieldName}' access not supported. Use @exec for method calls.`
      );
    }
    
    throw new Error(`Invalid array field: ${fieldName}`);
  }
  
  /**
   * Resolve object property access
   */
  private static async resolveObjectAccess(
    obj: any,
    fieldName: string,
    field: FieldAccess,
    env: Environment,
    options: FieldAccessOptions & { path: string[]; isLast: boolean }
  ): Promise<{ value: any; resolvedName: string }> {
    // Check if property exists
    if (fieldName in obj) {
      const value = obj[fieldName];
      
      // Handle methods
      if (typeof value === 'function') {
        if (!options.allowMethods) {
          throw new Error(
            `Method '${fieldName}' access not supported. Use @exec for method calls.`
          );
        }
        
        // Only allow method execution on last field
        if (!options.isLast) {
          throw new Error(
            `Cannot call method '${fieldName}' in the middle of field chain`
          );
        }
        
        // Execute method with arguments if provided
        const args = field.arguments 
          ? await this.resolveArguments(field.arguments, env)
          : [];
          
        const result = value.apply(obj, args);
        return { value: result, resolvedName: `${fieldName}()` };
      }
      
      return { value, resolvedName: fieldName };
    }
    
    // Check prototype chain for methods
    if (options.allowMethods && typeof obj[fieldName] === 'function') {
      // Same method handling as above
    }
    
    // Field not found
    if (options.optional) {
      return { value: undefined, resolvedName: fieldName };
    }
    
    throw new Error(
      `Property '${fieldName}' does not exist on object${
        options.path.length > 0 ? ` at path '${options.path.join('.')}'` : ''
      }`
    );
  }
  
  /**
   * Resolve field name (handle interpolation)
   */
  private static async resolveFieldName(
    field: FieldAccess,
    env: Environment
  ): Promise<string> {
    if (field.computed && field.expression) {
      // Handle computed property access like obj[expr]
      const { interpolate } = await import('../core/interpreter');
      return interpolate(field.expression, env);
    }
    
    return field.name;
  }
  
  /**
   * Resolve method arguments
   */
  private static async resolveArguments(
    args: FieldAccessArgument[],
    env: Environment
  ): Promise<any[]> {
    const resolved: any[] = [];
    
    for (const arg of args) {
      if (arg.type === 'literal') {
        resolved.push(arg.value);
      } else if (arg.type === 'variable') {
        const variable = env.getVariable(arg.name);
        if (!variable) {
          throw new Error(`Variable '${arg.name}' not found in method argument`);
        }
        resolved.push(variable.value);
      } else if (arg.type === 'expression') {
        const { interpolate } = await import('../core/interpreter');
        const value = await interpolate(arg.nodes, env);
        resolved.push(value);
      }
    }
    
    return resolved;
  }
}
```

### Convenience Functions

```typescript
/**
 * Resolve field access from a variable reference
 */
export async function resolveVariableFields(
  varRef: VariableReference,
  env: Environment,
  options?: FieldAccessOptions
): Promise<any> {
  const variable = env.getVariable(varRef.name);
  if (!variable) {
    throw ErrorFactory.variableNotFound(varRef.name, {
      location: varRef.location,
      ...options
    });
  }
  
  return FieldAccessResolver.resolve(
    variable.value,
    varRef.fields || [],
    env,
    {
      ...options,
      variableName: varRef.name,
      location: varRef.location
    }
  );
}

/**
 * Resolve a single field with optional chaining
 */
export async function resolveOptionalField<T = any>(
  source: any,
  fieldName: string,
  defaultValue?: T
): Promise<T> {
  const field: FieldAccess = { name: fieldName };
  
  return FieldAccessResolver.resolve<T>(
    source,
    [field],
    {} as Environment, // No env needed for simple property access
    {
      optional: true,
      defaultValue,
      allowMethods: false
    }
  );
}

/**
 * Resolve a dotted path string
 */
export async function resolvePath<T = any>(
  source: any,
  path: string,
  env: Environment,
  options?: FieldAccessOptions
): Promise<T> {
  const fields = path.split('.').map(name => ({ name } as FieldAccess));
  
  return FieldAccessResolver.resolve<T>(source, fields, env, options);
}

/**
 * Check if a field exists without throwing
 */
export async function hasField(
  source: any,
  fieldName: string
): Promise<boolean> {
  try {
    await resolveOptionalField(source, fieldName);
    return true;
  } catch {
    return false;
  }
}
```

### Error Handling

```typescript
// interpreter/utils/errors/field-access-errors.ts

export class FieldAccessError extends MlldError {
  constructor(details: {
    path: string;
    field?: string;
    reason: string;
    source?: string;
    location?: SourceLocation;
    cause?: Error;
  }) {
    const message = details.source
      ? `Cannot access '${details.path}' on variable '${details.source}': ${details.reason}`
      : `Cannot access '${details.path}': ${details.reason}`;
    
    super(message, details.location, {
      severity: ErrorSeverity.Error,
      code: 'FIELD_ACCESS_ERROR',
      cause: details.cause,
      details: {
        ...details,
        hint: generateFieldAccessHint(details)
      }
    });
  }
}

function generateFieldAccessHint(details: any): string {
  if (details.reason.includes('null or undefined')) {
    return 'Use optional chaining (?.) to handle missing values';
  }
  
  if (details.reason.includes('does not exist')) {
    return 'Check the property name for typos or verify the object structure';
  }
  
  if (details.reason.includes('out of bounds')) {
    return 'Check the array length before accessing by index';
  }
  
  return '';
}
```

### Special Features

```typescript
/**
 * Batch field resolution for performance
 */
export async function resolveBatchFields(
  sources: Array<{ source: any; fields: FieldAccess[] }>,
  env: Environment,
  options?: FieldAccessOptions
): Promise<any[]> {
  const results = await Promise.all(
    sources.map(({ source, fields }) =>
      FieldAccessResolver.resolve(source, fields, env, options)
    )
  );
  
  return results;
}

/**
 * Safe navigation with multiple fallbacks
 */
export async function resolveWithFallbacks<T = any>(
  source: any,
  pathsToTry: string[],
  env: Environment,
  defaultValue?: T
): Promise<T> {
  for (const path of pathsToTry) {
    try {
      const result = await resolvePath<T>(source, path, env, {
        optional: false
      });
      
      if (result !== undefined) {
        return result;
      }
    } catch {
      // Try next path
    }
  }
  
  return defaultValue as T;
}

/**
 * Deep property getter with type safety
 */
export function createPropertyGetter<T>(path: string) {
  return async (source: any, env: Environment): Promise<T> => {
    return resolvePath<T>(source, path, env);
  };
}
```

## Integration Examples

### Before:
```typescript
// show.ts
if (variableNode.fields && variableNode.fields.length > 0) {
  const { accessField } = await import('../utils/field-access');
  for (const field of variableNode.fields) {
    try {
      value = await accessField(value, field, env);
    } catch (error) {
      throw new Error(`Failed to access field: ${error.message}`);
    }
  }
}
```

### After:
```typescript
// show.ts
value = await resolveVariableFields(variableNode, env, {
  context: 'show directive',
  location: directive.location
});
```

### Before:
```typescript
// Complex nested access with error handling
let result = data;
try {
  result = result.users;
  if (!result) throw new Error('No users property');
  result = result[0];
  if (!result) throw new Error('No first user');
  result = result.name;
  if (!result) throw new Error('No name property');
} catch (error) {
  result = 'Unknown';
}
```

### After:
```typescript
// Complex access simplified
const result = await resolvePath(data, 'users.0.name', env, {
  optional: true,
  defaultValue: 'Unknown'
});
```

### Before:
```typescript
// Manual optional chaining
const city = user && user.address && user.address.city ? user.address.city : 'N/A';
```

### After:
```typescript
// Built-in optional chaining
const city = await resolveOptionalField(user, 'address.city', 'N/A');
```

## Migration Strategy

### Phase 1: Implementation
1. Create field-access-resolver module
2. Implement FieldAccessResolver class
3. Add convenience functions
4. Create comprehensive tests

### Phase 2: Critical Path Migration
1. Update show directive
2. Update var directive  
3. Update VariableReferenceEvaluator
4. Update run directive field access

### Phase 3: Complete Migration
1. Find all accessField imports
2. Replace with new resolver
3. Update error handling
4. Remove old implementation

## Benefits

1. **DRY Code** - Single implementation of field access logic
2. **Optional Chaining** - Built-in support for safe navigation
3. **Better Errors** - Consistent, helpful error messages
4. **Type Safety** - Generic types for return values
5. **Performance** - Can optimize repeated access patterns
6. **Features** - Support for computed properties, methods, etc.

## Testing Strategy

```typescript
describe('Field Access Resolver', () => {
  it('should resolve nested properties', async () => {
    const source = { user: { name: 'John', age: 30 } };
    
    const name = await resolvePath(source, 'user.name', env);
    expect(name).toBe('John');
  });
  
  it('should handle optional chaining', async () => {
    const source = { user: null };
    
    const name = await resolvePath(source, 'user.name', env, {
      optional: true,
      defaultValue: 'Anonymous'
    });
    
    expect(name).toBe('Anonymous');
  });
  
  it('should support array access', async () => {
    const source = { items: ['a', 'b', 'c'] };
    
    const first = await resolvePath(source, 'items.first', env);
    const last = await resolvePath(source, 'items.last', env);
    const second = await resolvePath(source, 'items.1', env);
    
    expect(first).toBe('a');
    expect(last).toBe('c');
    expect(second).toBe('b');
  });
  
  it('should provide helpful errors', async () => {
    const source = { user: { name: 'John' } };
    
    await expect(resolvePath(source, 'user.email', env))
      .rejects.toThrow(/Property 'email' does not exist.*user/);
  });
});
```

## Future Enhancements

1. **JMESPath Support** - Advanced query language for JSON
2. **Proxy-based Access** - Use Proxy for natural syntax
3. **Type Inference** - Better TypeScript type inference
4. **Performance Cache** - Cache resolved paths
5. **Lens Library** - Functional lens-based access
6. **GraphQL-like Queries** - Select multiple fields at once