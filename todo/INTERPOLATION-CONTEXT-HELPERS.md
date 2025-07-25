# Interpolation Context Helpers Specification

## ⚠️ MINOR REFINEMENT NEEDED

### Concerns:
1. **Feature Creep** - Too many helper functions might confuse developers
2. **Over-Abstraction** - Some helpers might make code less readable
3. **Context Validation** - May be overkill for internal APIs

### Recommended Simplifications:
1. **Start with Top 5 Helpers Only**:
   - `interpolateCommand()` - Used in run/exec directives
   - `interpolatePath()` - Used in file operations
   - `interpolateText()` - Used in display operations
   - `tryInterpolate()` - Safe interpolation with fallback
   - `interpolateNode()` - Single node helper
2. **Skip Complex Features**:
   - Remove batch interpolation initially
   - Skip analysis helpers (hasInterpolation, etc.)
   - No validation functions at first
3. **Focus on Error Context** - Main value is better error messages

### Implementation Note:
This is lower priority than the other utilities. Consider implementing after seeing how the Error Factory and AST utilities work out.

---

## Overview

This document specifies helper functions and wrappers for the interpolation system to reduce boilerplate and ensure consistent context usage throughout the mlld interpreter.

## Problem Statement

The `interpolate()` function is called 30+ times across the codebase with various patterns:

```typescript
// Basic interpolation (most common)
const value = await interpolate(nodes, env);

// With specific context
const command = await interpolate(commandNodes, env, InterpolationContext.ShellCommand);

// With format override
const result = await interpolate(valueNodes, env, InterpolationContext.PlainText, 'text');

// Complex nested interpolation
for (const node of nodes) {
  const interpolated = await interpolate([node], env);
  // Process result
}
```

Issues:
1. **Verbose calls** - Need to remember parameter order
2. **Context confusion** - Easy to use wrong context
3. **Missing validation** - No type checking for context appropriateness
4. **Performance** - Single-node arrays created unnecessarily
5. **Error context** - Errors don't indicate interpolation context

## Proposed Solution

### Core Architecture

```typescript
// interpreter/utils/interpolation-helpers.ts

export interface InterpolationOptions {
  context?: InterpolationContext;
  format?: 'markdown' | 'text';
  errorContext?: string;
  location?: SourceLocation;
  validateResult?: (result: string) => boolean;
  transformResult?: (result: string) => string;
}

export interface InterpolationResult {
  value: string;
  context: InterpolationContext;
  nodeCount: number;
  hasVariables: boolean;
  hasCommands: boolean;
}
```

### Context-Specific Helpers

```typescript
// interpreter/utils/interpolation-helpers.ts

/**
 * Interpolate nodes as shell command
 */
export async function interpolateCommand(
  nodes: MlldNode[],
  env: Environment,
  options: InterpolationOptions = {}
): Promise<string> {
  return interpolateWithContext(nodes, env, {
    ...options,
    context: InterpolationContext.ShellCommand,
    errorContext: options.errorContext || 'command interpolation'
  });
}

/**
 * Interpolate nodes as plain text
 */
export async function interpolateText(
  nodes: MlldNode[],
  env: Environment,
  options: InterpolationOptions = {}
): Promise<string> {
  return interpolateWithContext(nodes, env, {
    ...options,
    context: InterpolationContext.PlainText,
    errorContext: options.errorContext || 'text interpolation'
  });
}

/**
 * Interpolate nodes as file path
 */
export async function interpolatePath(
  nodes: MlldNode[],
  env: Environment,
  options: InterpolationOptions = {}
): Promise<string> {
  const result = await interpolateWithContext(nodes, env, {
    ...options,
    context: InterpolationContext.FilePath,
    errorContext: options.errorContext || 'path interpolation',
    transformResult: (path) => normalizePath(path, env)
  });
  
  // Validate path
  if (options.validateResult !== false) {
    validatePath(result, options);
  }
  
  return result;
}

/**
 * Interpolate nodes as JavaScript code
 */
export async function interpolateCode(
  nodes: MlldNode[],
  env: Environment,
  language: string,
  options: InterpolationOptions = {}
): Promise<string> {
  const context = getCodeContext(language);
  
  return interpolateWithContext(nodes, env, {
    ...options,
    context,
    errorContext: options.errorContext || `${language} code interpolation`
  });
}

/**
 * Interpolate nodes for display/output
 */
export async function interpolateForDisplay(
  nodes: MlldNode[],
  env: Environment,
  options: InterpolationOptions = {}
): Promise<string> {
  return interpolateWithContext(nodes, env, {
    ...options,
    context: InterpolationContext.Display,
    format: options.format || 'markdown',
    errorContext: options.errorContext || 'display interpolation'
  });
}

/**
 * Core interpolation with enhanced error handling
 */
async function interpolateWithContext(
  nodes: MlldNode[],
  env: Environment,
  options: InterpolationOptions
): Promise<string> {
  try {
    // Import interpolate function
    const { interpolate } = await import('../core/interpreter');
    
    // Perform interpolation
    const result = await interpolate(
      nodes,
      env,
      options.context,
      options.format
    );
    
    // Transform if requested
    if (options.transformResult) {
      return options.transformResult(result);
    }
    
    // Validate if requested
    if (options.validateResult && !options.validateResult(result)) {
      throw new InterpolationError({
        message: 'Interpolation result failed validation',
        context: options.context,
        result,
        location: options.location
      });
    }
    
    return result;
    
  } catch (error: any) {
    // Enhance error with context
    if (error instanceof MlldError) {
      throw error;
    }
    
    throw new InterpolationError({
      message: `Failed during ${options.errorContext}: ${error.message}`,
      context: options.context,
      location: options.location,
      cause: error
    });
  }
}
```

### Single Node Helpers

```typescript
/**
 * Interpolate a single node (common pattern)
 */
export async function interpolateNode(
  node: MlldNode,
  env: Environment,
  options: InterpolationOptions = {}
): Promise<string> {
  return interpolateWithContext([node], env, options);
}

/**
 * Interpolate a single text node
 */
export async function interpolateTextNode(
  node: TextNode,
  env: Environment,
  options: InterpolationOptions = {}
): Promise<string> {
  return interpolateNode(node, env, {
    ...options,
    context: InterpolationContext.PlainText
  });
}

/**
 * Interpolate a single variable reference
 */
export async function interpolateVariableRef(
  varRef: VariableReference,
  env: Environment,
  options: InterpolationOptions = {}
): Promise<string> {
  // Create a temporary node for interpolation
  const node: MlldNode = {
    type: 'VariableReference',
    nodeId: varRef.nodeId || generateNodeId(),
    location: varRef.location,
    ...varRef
  };
  
  return interpolateNode(node, env, options);
}
```

### Batch Interpolation

```typescript
/**
 * Interpolate multiple separate node arrays
 */
export async function interpolateBatch(
  nodeArrays: MlldNode[][],
  env: Environment,
  options: InterpolationOptions = {}
): Promise<string[]> {
  const results: string[] = [];
  const errors: Error[] = [];
  
  for (let i = 0; i < nodeArrays.length; i++) {
    try {
      const result = await interpolateWithContext(
        nodeArrays[i],
        env,
        options
      );
      results.push(result);
    } catch (error: any) {
      if (options.errorContext) {
        error.message = `${options.errorContext}[${i}]: ${error.message}`;
      }
      errors.push(error);
    }
  }
  
  if (errors.length > 0) {
    throw new BatchInterpolationError(errors);
  }
  
  return results;
}

/**
 * Interpolate and join with separator
 */
export async function interpolateAndJoin(
  nodeArrays: MlldNode[][],
  env: Environment,
  separator: string = '',
  options: InterpolationOptions = {}
): Promise<string> {
  const results = await interpolateBatch(nodeArrays, env, options);
  return results.join(separator);
}
```

### Analysis Helpers

```typescript
/**
 * Check if nodes contain interpolation
 */
export function hasInterpolation(nodes: MlldNode[]): boolean {
  return nodes.some(node => {
    switch (node.type) {
      case 'VariableReference':
      case 'CommandSubstitution':
      case 'TemplateString':
        return true;
      case 'Text':
        // Check for ${} patterns
        return /\$\{[^}]+\}/.test(node.value);
      default:
        return false;
    }
  });
}

/**
 * Extract variables used in interpolation
 */
export function extractInterpolatedVariables(nodes: MlldNode[]): string[] {
  const variables = new Set<string>();
  
  for (const node of nodes) {
    if (isVariableReference(node)) {
      variables.add(node.name);
    } else if (isTextNode(node)) {
      // Extract from ${var} patterns
      const matches = node.value.matchAll(/\$\{(\w+)\}/g);
      for (const match of matches) {
        variables.add(match[1]);
      }
    }
  }
  
  return Array.from(variables);
}

/**
 * Analyze interpolation complexity
 */
export function analyzeInterpolation(nodes: MlldNode[]): InterpolationAnalysis {
  return {
    hasVariables: nodes.some(n => isVariableReference(n)),
    hasCommands: nodes.some(n => n.type === 'CommandSubstitution'),
    hasTemplates: nodes.some(n => n.type === 'TemplateString'),
    isStatic: !hasInterpolation(nodes),
    variableCount: extractInterpolatedVariables(nodes).length,
    nodeCount: nodes.length
  };
}
```

### Context Utilities

```typescript
/**
 * Get appropriate context for code language
 */
function getCodeContext(language: string): InterpolationContext {
  switch (language.toLowerCase()) {
    case 'javascript':
    case 'js':
      return InterpolationContext.JavaScriptCode;
    case 'bash':
    case 'sh':
      return InterpolationContext.BashCode;
    case 'python':
    case 'py':
      return InterpolationContext.PythonCode;
    default:
      return InterpolationContext.PlainText;
  }
}

/**
 * Validate interpolation context matches node types
 */
export function validateInterpolationContext(
  nodes: MlldNode[],
  context: InterpolationContext
): void {
  const analysis = analyzeInterpolation(nodes);
  
  // Shell commands shouldn't have unescaped newlines
  if (context === InterpolationContext.ShellCommand && analysis.hasNewlines) {
    console.warn('Shell command contains newlines - may cause issues');
  }
  
  // File paths shouldn't have command substitution
  if (context === InterpolationContext.FilePath && analysis.hasCommands) {
    console.warn('File path contains command substitution - may be invalid');
  }
}

/**
 * Normalize path based on environment
 */
function normalizePath(path: string, env: Environment): string {
  // Remove trailing slashes
  path = path.replace(/\/+$/, '');
  
  // Resolve relative paths
  if (path.startsWith('./') || path.startsWith('../')) {
    const basePath = env.getFileDirectory();
    return env.pathService.resolve(basePath, path);
  }
  
  return path;
}

/**
 * Validate path format
 */
function validatePath(path: string, options: InterpolationOptions): void {
  // Check for invalid characters
  if (/[\0\n\r]/.test(path)) {
    throw new InterpolationError({
      message: 'Path contains invalid characters',
      context: InterpolationContext.FilePath,
      result: path,
      location: options.location
    });
  }
  
  // Warn about problematic patterns
  if (path.includes('..') && !options.allowParentPaths) {
    console.warn(`Path contains parent directory references: ${path}`);
  }
}
```

### Error Types

```typescript
// interpreter/utils/errors/interpolation-errors.ts

export class InterpolationError extends MlldError {
  constructor(details: {
    message: string;
    context?: InterpolationContext;
    result?: string;
    location?: SourceLocation;
    cause?: Error;
  }) {
    super(details.message, details.location, {
      severity: ErrorSeverity.Error,
      code: 'INTERPOLATION_ERROR',
      cause: details.cause,
      details: {
        context: details.context,
        result: details.result
      }
    });
  }
}

export class BatchInterpolationError extends MlldError {
  constructor(errors: Error[]) {
    super(
      `Failed to interpolate ${errors.length} items`,
      undefined,
      {
        severity: ErrorSeverity.Error,
        code: 'BATCH_INTERPOLATION_ERROR',
        details: { errors }
      }
    );
  }
}
```

## Integration Examples

### Before:
```typescript
// run.ts
const command = await interpolate(commandNodes, env, InterpolationContext.ShellCommand);
```

### After:
```typescript
// run.ts
const command = await interpolateCommand(commandNodes, env, {
  errorContext: 'run directive command',
  location: directive.location
});
```

### Before:
```typescript
// add.ts
let pathValue: string;
if (Array.isArray(pathNodes)) {
  pathValue = await interpolate(pathNodes, env);
} else {
  pathValue = await interpolate([pathNodes], env);
}
```

### After:
```typescript
// add.ts
const pathValue = await interpolatePath(
  Array.isArray(pathNodes) ? pathNodes : [pathNodes],
  env,
  { 
    errorContext: 'add directive path',
    location: directive.location
  }
);
```

### Before:
```typescript
// Complex interpolation with validation
const interpolated = await interpolate(nodes, env, InterpolationContext.PlainText);
if (!interpolated || interpolated.trim() === '') {
  throw new Error('Empty interpolation result');
}
const normalized = interpolated.trim().replace(/\s+/g, ' ');
```

### After:
```typescript
// Complex interpolation simplified
const normalized = await interpolateText(nodes, env, {
  validateResult: (r) => r.trim().length > 0,
  transformResult: (r) => r.trim().replace(/\s+/g, ' '),
  errorContext: 'text normalization'
});
```

## Migration Strategy

### Phase 1: Implementation
1. Create interpolation-helpers module
2. Implement all helper functions
3. Add comprehensive tests
4. Document usage patterns

### Phase 2: High-Usage Migration
1. Update run/exec directives (command interpolation)
2. Update add directive (path interpolation)
3. Update show directive (display interpolation)
4. Update text directives (text interpolation)

### Phase 3: Complete Migration
1. Replace remaining interpolate calls
2. Add lint rule for direct interpolate usage
3. Update developer documentation

## Benefits

1. **Less Boilerplate** - One-line calls instead of multi-line
2. **Type Safety** - Context-specific functions prevent misuse
3. **Better Errors** - Automatic error enhancement with context
4. **Validation** - Built-in validation for specific contexts
5. **Performance** - Avoid creating unnecessary arrays
6. **Discoverability** - Developers can see available contexts

## Testing Strategy

```typescript
describe('Interpolation Helpers', () => {
  it('should interpolate commands with proper context', async () => {
    const nodes = [createTextNode('echo '), createVariableRef('message')];
    env.setVariable(createTextVariable('message', 'Hello World'));
    
    const result = await interpolateCommand(nodes, env);
    expect(result).toBe('echo Hello World');
  });
  
  it('should validate paths during interpolation', async () => {
    const nodes = [createTextNode('/invalid\npath')];
    
    await expect(interpolatePath(nodes, env))
      .rejects.toThrow(/Path contains invalid characters/);
  });
  
  it('should handle batch interpolation', async () => {
    const batches = [
      [createTextNode('Hello')],
      [createTextNode('World')]
    ];
    
    const results = await interpolateBatch(batches, env);
    expect(results).toEqual(['Hello', 'World']);
  });
});
```

## Future Enhancements

1. **Caching** - Cache static interpolation results
2. **Streaming** - Support streaming interpolation for large content
3. **Async Variables** - Support variables that resolve asynchronously
4. **Template Compilation** - Pre-compile templates for performance
5. **Security Context** - Add security validation for different contexts