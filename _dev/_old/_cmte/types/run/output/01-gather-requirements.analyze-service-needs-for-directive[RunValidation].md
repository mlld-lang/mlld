# Improving the RunDirectiveValidator Service with TypeScript Type Enhancements

## Current Limitations Analysis

After reviewing the `RunDirectiveValidator` code and understanding the broader Meld architecture, I've identified several areas where stronger TypeScript types would significantly improve the validation process for `@run` directives.

### Current Issues in RunDirectiveValidator

1. **Lack of Run Directive Subtype Discrimination**
   - The current validator treats all `@run` directives uniformly without distinguishing between BasicCommand, LanguageCommand, and DefinedCommand subtypes
   - This forces downstream handlers to re-analyze the directive structure repeatedly

2. **Ambiguous Command Property Typing**
   - The code uses type checking (`typeof directive.command === 'string'`) and optional property access, indicating unclear typing
   - The fallback to `directive.command.raw` suggests inconsistent command representation

3. **Missing Validation for Specific Subtypes**
   - No validation for language-specific parameters in LanguageCommand
   - No validation for command references in DefinedCommand
   - No specific validation for multiline commands

4. **No Parameter Validation**
   - Parameters aren't validated at all in the current implementation
   - No type checking for parameter values or references

## Proposed TypeScript Type Enhancements

### 1. Discriminated Union for Run Directive Subtypes

```typescript
// Define a discriminated union type for run directives
type RunDirectiveType = 
  | BasicCommandRunDirective
  | LanguageCommandRunDirective
  | DefinedCommandRunDirective;

// Base interface with common properties
interface BaseRunDirective {
  kind: 'run';
  location?: Location;
}

// Basic shell command
interface BasicCommandRunDirective extends BaseRunDirective {
  subtype: 'basicCommand';
  isMultiLine: boolean;
  command: string;
}

// Language-specific command
interface LanguageCommandRunDirective extends BaseRunDirective {
  subtype: 'languageCommand';
  language: string;
  parameters: RunParameter[];
  command: string;
}

// Reference to defined command
interface DefinedCommandRunDirective extends BaseRunDirective {
  subtype: 'definedCommand';
  commandName: string;
  arguments: RunParameter[];
}

// Parameter type for commands
type RunParameter = 
  | { type: 'literal'; value: string }
  | { type: 'variable'; name: string; path?: string[] };
```

### 2. Type Guard Functions for Run Directive Classification

```typescript
/**
 * Type guards to classify run directives
 */
function isBasicCommand(directive: any): directive is BasicCommandRunDirective {
  return directive.kind === 'run' && 
         (!directive.language) && 
         (typeof directive.command === 'string' || 
          (typeof directive.command === 'object' && directive.command.raw));
}

function isLanguageCommand(directive: any): directive is LanguageCommandRunDirective {
  return directive.kind === 'run' && 
         !!directive.language && 
         Array.isArray(directive.parameters);
}

function isDefinedCommand(directive: any): directive is DefinedCommandRunDirective {
  return directive.kind === 'run' && 
         (directive.isReference || 
          (directive.command && typeof directive.command === 'object' && directive.command.name) ||
          (typeof directive.command === 'string' && directive.command.startsWith('$')));
}
```

### 3. Enhanced Validator Interface

```typescript
interface DirectiveValidator<T> {
  validate(node: DirectiveNode): Promise<T>;
}

/**
 * Enhanced run directive validator that returns typed result
 */
class RunDirectiveValidator implements DirectiveValidator<RunDirectiveType> {
  async validate(node: DirectiveNode): Promise<RunDirectiveType> {
    const directive = node.directive;
    
    // Basic validation for all run directives
    if (!directive.command && !directive.isReference) {
      throw new MeldDirectiveError(
        'Run directive requires a command',
        'run',
        { 
          location: node.location?.start,
          code: DirectiveErrorCode.VALIDATION_FAILED
        }
      );
    }
    
    // Classify and validate by subtype
    if (isDefinedCommand(directive)) {
      return this.validateDefinedCommand(directive, node);
    } else if (isLanguageCommand(directive)) {
      return this.validateLanguageCommand(directive, node);
    } else if (isBasicCommand(directive)) {
      return this.validateBasicCommand(directive, node);
    }
    
    // If we can't classify, throw error
    throw new MeldDirectiveError(
      'Invalid run directive format',
      'run',
      { 
        location: node.location?.start,
        code: DirectiveErrorCode.VALIDATION_FAILED
      }
    );
  }
  
  // Specialized validation methods for each subtype
  private validateBasicCommand(directive: any, node: DirectiveNode): BasicCommandRunDirective {
    // Implementation details...
  }
  
  private validateLanguageCommand(directive: any, node: DirectiveNode): LanguageCommandRunDirective {
    // Implementation details...
  }
  
  private validateDefinedCommand(directive: any, node: DirectiveNode): DefinedCommandRunDirective {
    // Implementation details...
  }
}
```

## Benefits of These Type Enhancements

### 1. Early Type Discrimination

**Current Issue:** The validator doesn't distinguish between run subtypes, forcing downstream handlers to repeatedly analyze the directive structure.

**Benefit:** With the discriminated union, each directive is classified exactly once during validation. This classification becomes part of the type system, allowing TypeScript to ensure correct handling downstream.

```typescript
// Example of how this simplifies downstream code
async handleRunDirective(directive: RunDirectiveType): Promise<string> {
  switch(directive.subtype) {
    case 'basicCommand':
      // TypeScript knows this is a BasicCommandRunDirective
      return this.executeBasicCommand(directive.command, directive.isMultiLine);
      
    case 'languageCommand':
      // TypeScript knows this is a LanguageCommandRunDirective
      return this.executeLanguageCommand(directive.language, directive.command, directive.parameters);
      
    case 'definedCommand':
      // TypeScript knows this is a DefinedCommandRunDirective
      return this.executeDefinedCommand(directive.commandName, directive.arguments);
  }
}
```

### 2. Comprehensive Validation

**Current Issue:** The validator only checks if a command exists and isn't empty, missing subtype-specific validation.

**Benefit:** Each subtype has dedicated validation logic that checks all required fields, ensuring commands are well-formed before execution.

### 3. Parameter Type Safety

**Current Issue:** Parameters aren't validated, leading to potential runtime errors during command execution.

**Benefit:** With strongly typed parameters, the system can validate parameter types during parsing, preventing runtime errors and providing better error messages.

### 4. Simplified Command Execution

**Current Issue:** Command handlers must extract and validate command properties before execution.

**Benefit:** After validation, handlers receive fully validated, correctly typed command objects, eliminating redundant validation and type checking.

## Implementation Strategy

1. **Define the type hierarchy** in a shared types file
2. **Implement type guards** for classifying run directives
3. **Enhance the validator** to use these types and perform comprehensive validation
4. **Update command handlers** to leverage the stronger types

This approach maintains compatibility with the existing DI architecture while providing much stronger type safety and clearer code organization.

## Conclusion

Implementing these TypeScript type enhancements will significantly improve the `RunDirectiveValidator` service by:

1. Providing explicit type discrimination for run directive subtypes
2. Ensuring comprehensive validation specific to each subtype
3. Eliminating redundant type checking and validation in downstream handlers
4. Providing clearer, more specific error messages during validation
5. Making the code more maintainable through stronger type safety

These improvements align with Meld's architecture principles of clear service responsibilities and strong type safety, while addressing the specific challenges of the complex `@run` directive syntax.