# Proposed Improvements for Variable Resolution with Embed Types

## Analysis of Current Code

After reviewing the `VariableReferenceResolver` class and the documentation on the `@embed` directive, I've identified several areas where stronger typing could improve the handling of variable resolution in embed contexts.

## Key Areas for Improvement

### 1. Embed-Specific Resolution Context Type

#### Current Implementation Issues
Currently, the code detects embed context through ad-hoc property checks:

```typescript
// Check if this is a variable embed context and log details
const isVariableEmbed = (context as any).isVariableEmbed === true;
const disablePathPrefixing = (context as any).disablePathPrefixing === true;
```

This approach:
- Uses unsafe type casting with `as any`
- Relies on string property names that could be mistyped
- Requires repetitive property checking throughout the code
- Lacks compile-time validation for required embed properties

#### Proposed Solution: Discriminated Union for Resolution Context

```typescript
// Base resolution context
interface BaseResolutionContext {
  state: IStateService;
  currentFilePath?: string;
  strict: boolean;
  allowedVariableTypes?: Record<string, boolean>;
}

// Standard resolution context
interface StandardResolutionContext extends BaseResolutionContext {
  contextType: 'standard';
}

// Variable embed resolution context
interface VariableEmbedResolutionContext extends BaseResolutionContext {
  contextType: 'variableEmbed';
  isVariableEmbed: true;
  disablePathPrefixing: true;
  preventPathPrefixing: true;
}

// Template embed resolution context
interface TemplateEmbedResolutionContext extends BaseResolutionContext {
  contextType: 'templateEmbed';
  isVariableEmbed: true;
  disablePathPrefixing: true;
  isTemplateContent: true;
}

// Path embed resolution context
interface PathEmbedResolutionContext extends BaseResolutionContext {
  contextType: 'pathEmbed';
  allowPathPrefixing: true;
}

// Combined type using discriminated union
type ResolutionContext = 
  | StandardResolutionContext 
  | VariableEmbedResolutionContext 
  | TemplateEmbedResolutionContext
  | PathEmbedResolutionContext;
```

#### Justification
1. **Type Safety**: Eliminates unsafe type assertions and ensures all required properties are present
2. **Self-Documenting**: Makes the different context types explicit and documents their properties
3. **Exhaustive Checking**: Enables TypeScript's exhaustive checking with discriminated unions
4. **Error Prevention**: Prevents typos in property names and ensures consistent property usage
5. **Better IDE Support**: Provides better autocompletion and documentation in IDEs

### 2. Embed-Specific Formatting Context Type

#### Current Implementation Issues
The code currently uses a string union type and optional formatting parameters:

```typescript
type FormatContext = 'inline' | 'block';

// Many optional parameters with unclear relationships
convertToString(
  value: any, 
  formattingContext?: { 
    isBlock?: boolean; 
    nodeType?: string; 
    linePosition?: 'start' | 'middle' | 'end';
    isTransformation?: boolean;
  }
): string
```

This approach:
- Doesn't capture the relationship between formatting context and embed types
- Uses optional parameters that may be inconsistently provided
- Lacks clear documentation on which parameters apply to which embed types

#### Proposed Solution: Specific Formatting Types by Context

```typescript
// Base formatting options
interface BaseFormattingOptions {
  formatContext: 'inline' | 'block';
}

// Embed-specific formatting options
interface EmbedFormattingOptions extends BaseFormattingOptions {
  embedType: 'path' | 'variable' | 'template';
  isTransformation: boolean;
}

// Template-specific formatting options
interface TemplateFormattingOptions extends EmbedFormattingOptions {
  embedType: 'template';
  linePosition: 'start' | 'middle' | 'end';
  preserveWhitespace: boolean;
}

// Combined type
type FormattingOptions = 
  | BaseFormattingOptions 
  | EmbedFormattingOptions 
  | TemplateFormattingOptions;

// Updated method signature
convertToString(value: any, options: FormattingOptions): string
```

#### Justification
1. **Explicit Intent**: Makes it clear which formatting options apply to which contexts
2. **Required Properties**: Ensures required properties are always provided
3. **Logical Grouping**: Groups related properties by their usage context
4. **Maintenance**: Makes it easier to add or modify formatting options for specific embed types
5. **Documentation**: Serves as self-documentation for the different formatting requirements

### 3. Embed Type Detection Interface

#### Current Implementation Issues
The current code doesn't have a clear interface for detecting embed types, which would typically be handled in the directive handler. When the resolver receives the context, it has to infer the embed type from various properties.

#### Proposed Solution: Embed Type Detection Interface

```typescript
// Enum for embed types
enum EmbedType {
  PATH = 'path',
  VARIABLE = 'variable',
  TEMPLATE = 'template'
}

// Interface for embed type detection
interface IEmbedTypeDetector {
  detectEmbedType(node: DirectiveNode): EmbedType;
  isVariableReference(value: any): boolean;
  isTemplateSyntax(value: string): boolean;
  isPathSyntax(value: string): boolean;
}

// Implementation example
class EmbedTypeDetector implements IEmbedTypeDetector {
  detectEmbedType(node: DirectiveNode): EmbedType {
    const directiveData = node.directive as EmbedDirectiveParams;
    
    if (this.isTemplateSyntax(directiveData.content)) {
      return EmbedType.TEMPLATE;
    }
    
    if (this.isVariableReference(directiveData.path)) {
      return EmbedType.VARIABLE;
    }
    
    return EmbedType.PATH;
  }
  
  isVariableReference(value: any): boolean {
    if (typeof value === 'object' && 
        'isVariableReference' in value && 
        value.isVariableReference === true) {
      return true;
    }
    
    if (typeof value === 'string' && 
        value.startsWith('{{') && 
        value.endsWith('}}')) {
      return true;
    }
    
    return false;
  }
  
  isTemplateSyntax(value: string): boolean {
    return typeof value === 'string' && 
           value.startsWith('[[') && 
           value.endsWith(']]');
  }
  
  isPathSyntax(value: string): boolean {
    // Path syntax detection logic
    return !this.isVariableReference(value) && !this.isTemplateSyntax(value);
  }
}
```

#### Justification
1. **Centralized Logic**: Puts embed type detection logic in one place
2. **Reusable**: Can be used by both directive handlers and the resolver
3. **Testable**: Makes it easier to test embed type detection logic
4. **Extensible**: Makes it easier to add new embed types or detection rules
5. **Consistent**: Ensures consistent embed type detection throughout the codebase

### 4. Embed Directive Parameters Interface

#### Current Implementation Issues
The code doesn't have a clear interface for embed directive parameters, which makes it difficult to understand what properties are available and required.

#### Proposed Solution: Strongly Typed Directive Parameters

```typescript
// Base embed directive parameters
interface BaseEmbedDirectiveParams {
  kind: 'embed';
}

// Path embed directive parameters
interface PathEmbedDirectiveParams extends BaseEmbedDirectiveParams {
  embedType: 'path';
  path: string;
}

// Variable embed directive parameters
interface VariableEmbedDirectiveParams extends BaseEmbedDirectiveParams {
  embedType: 'variable';
  path: {
    isVariable