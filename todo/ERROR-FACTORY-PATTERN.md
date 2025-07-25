# Error Factory Pattern Specification

## Overview

This document specifies a centralized error creation system to ensure consistent error messages, proper error typing, and helpful debugging information throughout the mlld interpreter.

## Problem Statement

Current error creation is inconsistent and scattered:

```typescript
// Generic errors with no context
throw new Error(`Variable not found: ${varName}`);
throw new Error('Missing command');
throw new Error(`Invalid type: ${type}`);

// Inconsistent error messages for same condition
throw new Error(`Unknown variable: ${name}`);
throw new Error(`Variable '${name}' is not defined`);
throw new Error(`Cannot find variable ${name}`);

// Lost debugging context
catch (error) {
  throw new Error(`Failed to process: ${error.message}`);
}
```

Issues:
1. **Inconsistent messages** - Same errors worded differently
2. **No error codes** - Can't programmatically handle specific errors
3. **Lost context** - Stack traces and locations not preserved
4. **Poor debugging** - Errors don't suggest solutions
5. **No type safety** - All errors are generic Error type

## Proposed Solution

### Core Architecture

```typescript
// interpreter/utils/errors/error-factory.ts

export interface ErrorContext {
  location?: SourceLocation;
  directive?: string;
  operation?: string;
  availableOptions?: string[];
  suggestion?: string;
  cause?: Error;
  metadata?: Record<string, any>;
}

export interface ErrorTemplate {
  code: string;
  messageTemplate: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  helpUrl?: string;
}

export enum ErrorCategory {
  Syntax = 'syntax',
  Runtime = 'runtime',
  Type = 'type',
  IO = 'io',
  Security = 'security',
  Module = 'module',
  Variable = 'variable'
}
```

### Error Factory Implementation

```typescript
// interpreter/utils/errors/error-factory.ts

export class ErrorFactory {
  private static templates = new Map<string, ErrorTemplate>();
  
  static {
    // Register all error templates
    this.registerTemplates();
  }
  
  /**
   * Variable-related errors
   */
  static variableNotFound(
    name: string,
    context: ErrorContext = {}
  ): MlldVariableError {
    return this.createError('VARIABLE_NOT_FOUND', { name }, context);
  }
  
  static variableTypeMismatch(
    name: string,
    expected: string | string[],
    actual: string,
    context: ErrorContext = {}
  ): MlldTypeError {
    return this.createError('VARIABLE_TYPE_MISMATCH', {
      name,
      expected: Array.isArray(expected) ? expected.join(' | ') : expected,
      actual
    }, context);
  }
  
  static variableRedefinition(
    name: string,
    originalLocation?: SourceLocation,
    context: ErrorContext = {}
  ): MlldVariableError {
    return this.createError('VARIABLE_REDEFINITION', {
      name,
      originalLocation: originalLocation ? formatLocation(originalLocation) : 'unknown'
    }, context);
  }
  
  /**
   * Directive-related errors
   */
  static missingRequiredField(
    directive: string,
    field: string,
    context: ErrorContext = {}
  ): MlldSyntaxError {
    return this.createError('MISSING_REQUIRED_FIELD', {
      directive,
      field
    }, { ...context, directive });
  }
  
  static invalidDirectiveValue(
    directive: string,
    field: string,
    reason: string,
    context: ErrorContext = {}
  ): MlldSyntaxError {
    return this.createError('INVALID_DIRECTIVE_VALUE', {
      directive,
      field,
      reason
    }, { ...context, directive });
  }
  
  /**
   * Type-related errors
   */
  static invalidType(
    value: any,
    expected: string,
    context: ErrorContext = {}
  ): MlldTypeError {
    const actual = getValueType(value);
    return this.createError('INVALID_TYPE', {
      expected,
      actual,
      value: formatValue(value)
    }, context);
  }
  
  static unsupportedOperation(
    operation: string,
    type: string,
    context: ErrorContext = {}
  ): MlldTypeError {
    return this.createError('UNSUPPORTED_OPERATION', {
      operation,
      type
    }, context);
  }
  
  /**
   * Execution errors
   */
  static commandExecutionFailed(
    command: string,
    exitCode: number,
    stderr: string,
    context: ErrorContext = {}
  ): MlldCommandExecutionError {
    return this.createError('COMMAND_EXECUTION_FAILED', {
      command: truncateCommand(command),
      exitCode,
      stderr: truncateOutput(stderr)
    }, { ...context, operation: 'command execution' });
  }
  
  static executionTimeout(
    operation: string,
    timeout: number,
    context: ErrorContext = {}
  ): MlldRuntimeError {
    return this.createError('EXECUTION_TIMEOUT', {
      operation,
      timeout: `${timeout}ms`
    }, context);
  }
  
  /**
   * Module/Import errors
   */
  static moduleNotFound(
    moduleName: string,
    searchPaths: string[],
    context: ErrorContext = {}
  ): MlldModuleError {
    return this.createError('MODULE_NOT_FOUND', {
      moduleName,
      searchPaths: searchPaths.join(', ')
    }, { 
      ...context, 
      suggestion: suggestModuleName(moduleName, searchPaths) 
    });
  }
  
  static circularImport(
    path: string,
    importChain: string[],
    context: ErrorContext = {}
  ): MlldModuleError {
    return this.createError('CIRCULAR_IMPORT', {
      path,
      chain: importChain.join(' → ')
    }, context);
  }
  
  /**
   * IO errors
   */
  static fileNotFound(
    path: string,
    operation: string,
    context: ErrorContext = {}
  ): MlldIOError {
    return this.createError('FILE_NOT_FOUND', {
      path,
      operation
    }, { 
      ...context,
      suggestion: 'Check the file path and ensure the file exists'
    });
  }
  
  static permissionDenied(
    path: string,
    operation: string,
    context: ErrorContext = {}
  ): MlldIOError {
    return this.createError('PERMISSION_DENIED', {
      path,
      operation
    }, context);
  }
  
  /**
   * Security errors
   */
  static untrustedOperation(
    operation: string,
    reason: string,
    context: ErrorContext = {}
  ): MlldSecurityError {
    return this.createError('UNTRUSTED_OPERATION', {
      operation,
      reason
    }, context);
  }
  
  /**
   * Create error from template
   */
  private static createError(
    code: string,
    params: Record<string, any>,
    context: ErrorContext
  ): MlldError {
    const template = this.templates.get(code);
    if (!template) {
      throw new Error(`Unknown error code: ${code}`);
    }
    
    // Interpolate message
    const message = this.interpolateMessage(template.messageTemplate, params);
    
    // Create appropriate error class
    const ErrorClass = this.getErrorClass(template.category);
    
    return new ErrorClass(message, context.location, {
      code,
      severity: template.severity,
      cause: context.cause,
      details: {
        ...params,
        ...context.metadata,
        directive: context.directive,
        operation: context.operation,
        suggestion: context.suggestion || this.generateSuggestion(code, params, context),
        helpUrl: template.helpUrl
      }
    });
  }
  
  /**
   * Register all error templates
   */
  private static registerTemplates() {
    // Variable errors
    this.register({
      code: 'VARIABLE_NOT_FOUND',
      messageTemplate: "Variable '{{name}}' not found",
      severity: ErrorSeverity.Error,
      category: ErrorCategory.Variable
    });
    
    this.register({
      code: 'VARIABLE_TYPE_MISMATCH',
      messageTemplate: "Variable '{{name}}' has type '{{actual}}' but expected {{expected}}",
      severity: ErrorSeverity.Error,
      category: ErrorCategory.Type
    });
    
    this.register({
      code: 'VARIABLE_REDEFINITION',
      messageTemplate: "Variable '{{name}}' is already defined at {{originalLocation}}",
      severity: ErrorSeverity.Error,
      category: ErrorCategory.Variable
    });
    
    // Directive errors
    this.register({
      code: 'MISSING_REQUIRED_FIELD',
      messageTemplate: "@{{directive}} directive missing required field '{{field}}'",
      severity: ErrorSeverity.Error,
      category: ErrorCategory.Syntax
    });
    
    this.register({
      code: 'INVALID_DIRECTIVE_VALUE',
      messageTemplate: "@{{directive}} directive has invalid {{field}}: {{reason}}",
      severity: ErrorSeverity.Error,
      category: ErrorCategory.Syntax
    });
    
    // Type errors
    this.register({
      code: 'INVALID_TYPE',
      messageTemplate: "Expected {{expected}} but got {{actual}}",
      severity: ErrorSeverity.Error,
      category: ErrorCategory.Type
    });
    
    this.register({
      code: 'UNSUPPORTED_OPERATION',
      messageTemplate: "Operation '{{operation}}' is not supported for type '{{type}}'",
      severity: ErrorSeverity.Error,
      category: ErrorCategory.Type
    });
    
    // Execution errors
    this.register({
      code: 'COMMAND_EXECUTION_FAILED',
      messageTemplate: "Command failed with exit code {{exitCode}}: {{command}}",
      severity: ErrorSeverity.Error,
      category: ErrorCategory.Runtime
    });
    
    this.register({
      code: 'EXECUTION_TIMEOUT',
      messageTemplate: "{{operation}} timed out after {{timeout}}",
      severity: ErrorSeverity.Error,
      category: ErrorCategory.Runtime
    });
    
    // Module errors
    this.register({
      code: 'MODULE_NOT_FOUND',
      messageTemplate: "Cannot find module '{{moduleName}}' in: {{searchPaths}}",
      severity: ErrorSeverity.Error,
      category: ErrorCategory.Module
    });
    
    this.register({
      code: 'CIRCULAR_IMPORT',
      messageTemplate: "Circular import detected: {{chain}}",
      severity: ErrorSeverity.Error,
      category: ErrorCategory.Module
    });
    
    // IO errors
    this.register({
      code: 'FILE_NOT_FOUND',
      messageTemplate: "Cannot {{operation}} file '{{path}}': File not found",
      severity: ErrorSeverity.Error,
      category: ErrorCategory.IO
    });
    
    this.register({
      code: 'PERMISSION_DENIED',
      messageTemplate: "Cannot {{operation}} file '{{path}}': Permission denied",
      severity: ErrorSeverity.Error,
      category: ErrorCategory.IO
    });
    
    // Security errors
    this.register({
      code: 'UNTRUSTED_OPERATION',
      messageTemplate: "Security: Cannot perform {{operation}}: {{reason}}",
      severity: ErrorSeverity.Error,
      category: ErrorCategory.Security
    });
  }
  
  private static register(template: ErrorTemplate) {
    this.templates.set(template.code, template);
  }
  
  private static interpolateMessage(
    template: string,
    params: Record<string, any>
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return params[key]?.toString() || match;
    });
  }
  
  private static getErrorClass(category: ErrorCategory): typeof MlldError {
    switch (category) {
      case ErrorCategory.Syntax:
        return MlldSyntaxError;
      case ErrorCategory.Type:
        return MlldTypeError;
      case ErrorCategory.IO:
        return MlldIOError;
      case ErrorCategory.Security:
        return MlldSecurityError;
      case ErrorCategory.Module:
        return MlldModuleError;
      case ErrorCategory.Variable:
        return MlldVariableError;
      default:
        return MlldRuntimeError;
    }
  }
  
  private static generateSuggestion(
    code: string,
    params: Record<string, any>,
    context: ErrorContext
  ): string | undefined {
    // Generate contextual suggestions based on error type
    switch (code) {
      case 'VARIABLE_NOT_FOUND':
        if (context.availableOptions?.length) {
          const similar = findSimilar(params.name, context.availableOptions);
          if (similar) {
            return `Did you mean '${similar}'?`;
          }
        }
        return 'Check the variable name for typos';
        
      case 'MODULE_NOT_FOUND':
        return 'Run "mlld install" to install missing modules';
        
      case 'VARIABLE_TYPE_MISMATCH':
        return `Convert the variable to ${params.expected} or use a different variable`;
        
      default:
        return undefined;
    }
  }
}
```

### Specialized Error Classes

```typescript
// interpreter/utils/errors/error-types.ts

export class MlldVariableError extends MlldError {
  constructor(message: string, location?: SourceLocation, options?: ErrorOptions) {
    super(message, location, { ...options, category: 'variable' });
  }
}

export class MlldTypeError extends MlldError {
  constructor(message: string, location?: SourceLocation, options?: ErrorOptions) {
    super(message, location, { ...options, category: 'type' });
  }
}

export class MlldSyntaxError extends MlldError {
  constructor(message: string, location?: SourceLocation, options?: ErrorOptions) {
    super(message, location, { ...options, category: 'syntax' });
  }
}

export class MlldIOError extends MlldError {
  constructor(message: string, location?: SourceLocation, options?: ErrorOptions) {
    super(message, location, { ...options, category: 'io' });
  }
}

export class MlldSecurityError extends MlldError {
  constructor(message: string, location?: SourceLocation, options?: ErrorOptions) {
    super(message, location, { ...options, category: 'security' });
  }
}

export class MlldModuleError extends MlldError {
  constructor(message: string, location?: SourceLocation, options?: ErrorOptions) {
    super(message, location, { ...options, category: 'module' });
  }
}

export class MlldRuntimeError extends MlldError {
  constructor(message: string, location?: SourceLocation, options?: ErrorOptions) {
    super(message, location, { ...options, category: 'runtime' });
  }
}
```

### Helper Functions

```typescript
// interpreter/utils/errors/error-helpers.ts

/**
 * Format a value for error messages
 */
export function formatValue(value: any, maxLength: number = 50): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  
  if (str.length > maxLength) {
    return str.substring(0, maxLength - 3) + '...';
  }
  
  return str;
}

/**
 * Get human-readable type name
 */
export function getValueType(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (value instanceof RegExp) return 'regex';
  
  const type = typeof value;
  if (type === 'object') {
    return value.constructor?.name || 'object';
  }
  
  return type;
}

/**
 * Truncate long command/output for display
 */
export function truncateCommand(command: string, maxLength: number = 100): string {
  const lines = command.split('\n');
  if (lines.length > 3) {
    return lines.slice(0, 3).join('\n') + '\n...';
  }
  
  if (command.length > maxLength) {
    return command.substring(0, maxLength - 3) + '...';
  }
  
  return command;
}

export function truncateOutput(output: string, maxLength: number = 200): string {
  return truncateCommand(output, maxLength);
}

/**
 * Find similar string in array (for suggestions)
 */
export function findSimilar(
  input: string,
  options: string[],
  maxDistance: number = 3
): string | undefined {
  let bestMatch: string | undefined;
  let bestDistance = maxDistance + 1;
  
  for (const option of options) {
    const distance = levenshteinDistance(input, option);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = option;
    }
  }
  
  return bestMatch;
}

/**
 * Format source location for display
 */
export function formatLocation(location: SourceLocation): string {
  if (!location) return 'unknown location';
  
  const parts: string[] = [];
  
  if (location.filePath) {
    parts.push(location.filePath);
  }
  
  if (location.start?.line) {
    parts.push(`line ${location.start.line}`);
    if (location.start.column) {
      parts.push(`column ${location.start.column}`);
    }
  }
  
  return parts.join(', ') || 'unknown location';
}
```

## Integration Examples

### Before:
```typescript
// var.ts
if (!variable) {
  throw new Error(`Variable not found: ${varName}`);
}

if (variable.type !== 'text') {
  throw new Error(`Expected text variable but got ${variable.type}`);
}
```

### After:
```typescript
// var.ts
if (!variable) {
  throw ErrorFactory.variableNotFound(varName, {
    location: directive.location,
    directive: 'var',
    availableOptions: env.getAvailableVariableNames()
  });
}

if (variable.type !== 'text') {
  throw ErrorFactory.variableTypeMismatch(
    varName,
    'text',
    variable.type,
    { location: directive.location, directive: 'var' }
  );
}
```

### Before:
```typescript
// Command execution
catch (error) {
  throw new Error(`Command failed: ${error.message}`);
}
```

### After:
```typescript
// Command execution
catch (error: any) {
  throw ErrorFactory.commandExecutionFailed(
    command,
    error.status || 1,
    error.stderr || error.message,
    { 
      location: directive.location,
      directive: 'run',
      cause: error
    }
  );
}
```

## Migration Strategy

### Phase 1: Setup
1. Create error factory module
2. Define all error templates
3. Implement specialized error classes
4. Add helper functions

### Phase 2: High-Impact Areas
1. Replace variable resolution errors
2. Replace command execution errors  
3. Replace file operation errors
4. Replace import/module errors

### Phase 3: Complete Migration
1. Replace remaining error creation
2. Add ESLint rule to catch raw Error usage
3. Update error handling documentation

## Benefits

1. **Consistent Messages** - All errors use same wording
2. **Error Codes** - Can handle specific errors programmatically
3. **Better Context** - Errors include all relevant debugging info
4. **Helpful Suggestions** - Errors suggest how to fix problems
5. **Type Safety** - Catch error type issues at compile time
6. **Maintainability** - Update error messages in one place

## Testing Strategy

```typescript
describe('Error Factory', () => {
  it('should create consistent variable not found errors', () => {
    const error = ErrorFactory.variableNotFound('myVar', {
      availableOptions: ['myVariable', 'myValue']
    });
    
    expect(error.code).toBe('VARIABLE_NOT_FOUND');
    expect(error.message).toBe("Variable 'myVar' not found");
    expect(error.details.suggestion).toBe("Did you mean 'myVariable'?");
  });
  
  it('should preserve error context', () => {
    const cause = new Error('Original error');
    const location = { start: { line: 10, column: 5 } };
    
    const error = ErrorFactory.fileNotFound('/path/to/file', 'read', {
      location,
      cause
    });
    
    expect(error.cause).toBe(cause);
    expect(error.location).toBe(location);
    expect(error.stack).toContain('Original error');
  });
});
```

## Future Enhancements

1. **Error Recovery** - Suggest automatic fixes
2. **Error Aggregation** - Collect multiple errors before failing
3. **Internationalization** - Support error messages in multiple languages
4. **Error Analytics** - Track common errors for improvement
5. **Interactive Fixes** - Offer to apply suggested fixes automatically