# Proposal: Subdividing @embed Directive Types

## Current Situation

The `@embed` directive currently serves three distinct purposes:

1. **fileEmbed**: Embedding file content as literal text
   - Example: `@embed [path/to/file.md]`
   - Reads content from file system
   - Content is treated as literal text

2. **variableEmbed**: Embedding variable content as literal text
   - Example: `@embed {{variable}}`
   - Resolves variable from state
   - Content is treated as literal text

3. **templateEmbed**: Embedding multi-line template content with variable interpolation
   - Example: `@embed [[ Template with {{variables}} ]]`
   - Supports variable interpolation within the template
   - Content is treated as literal text after interpolation

Despite these distinct behaviors, all three are handled by a single `EmbedDirectiveHandler` class, which makes the code harder to understand and maintain. The current implementation has led to confusion and test failures due to inconsistent expectations about when content should be parsed.

## Goals

1. Create clear distinctions between the three types of embeds
2. Provide explicit, well-documented interfaces for each embed type
3. Ensure consistent behavior across the codebase
4. Make the system more maintainable and easier to understand
5. Simplify testing by having clearer expectations

## Implementation Proposal

### 1. Base Interface and Abstract Class

```typescript
// Base interface for all embed handlers
interface IEmbedHandler {
  execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult>;
  supportsNode(node: DirectiveNode): boolean;
}

// Abstract base class for common functionality
abstract class BaseEmbedHandler implements IEmbedHandler {
  constructor(
    protected validationService: IValidationService,
    protected resolutionService: IResolutionService,
    protected stateService: IStateService,
    protected logger: ILogger
  ) {}

  // Common functionality for all embed types
  protected abstract getContent(node: DirectiveNode, context: DirectiveContext): Promise<string>;
  
  // Common post-processing for all embed types (section extraction, heading levels, etc.)
  protected async processContent(content: string, node: DirectiveNode, context: DirectiveContext): Promise<string> {
    // Extract section, apply heading level, etc.
    // (Move existing code here)
    return content;
  }
  
  // Common execution flow
  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
    // Validate node
    // Get content through abstract method
    // Process content (sections, heading levels, etc.)
    // Return result
  }
  
  // Determine if this handler supports the given node
  abstract supportsNode(node: DirectiveNode): boolean;
}
```

### 2. Concrete Implementations

#### File Embed Handler

```typescript
/**
 * FileEmbedHandler - Handles embedding content from file paths
 * 
 * Example: @embed [path/to/file.md]
 */
class FileEmbedHandler extends BaseEmbedHandler {
  constructor(
    validationService: IValidationService,
    resolutionService: IResolutionService,
    stateService: IStateService,
    circularityService: ICircularityService,
    fileSystemService: IFileSystemService,
    logger: ILogger
  ) {
    super(validationService, resolutionService, stateService, logger);
    this.circularityService = circularityService;
    this.fileSystemService = fileSystemService;
  }
  
  // Implement file-specific content retrieval
  protected async getContent(node: DirectiveNode, context: DirectiveContext): Promise<string> {
    // Resolve path
    // Handle circularity
    // Read file
    // Return content
  }
  
  // Check if this is a file path embed
  supportsNode(node: DirectiveNode): boolean {
    return typeof node.directive?.path === 'string';
  }
}
```

#### Variable Embed Handler

```typescript
/**
 * VariableEmbedHandler - Handles embedding content from variable references
 * 
 * Example: @embed {{variable}}
 */
class VariableEmbedHandler extends BaseEmbedHandler {
  // Implement variable-specific content retrieval
  protected async getContent(node: DirectiveNode, context: DirectiveContext): Promise<string> {
    // Resolve variable reference
    // Return content
  }
  
  // Check if this is a variable reference embed
  supportsNode(node: DirectiveNode): boolean {
    return typeof node.directive?.path === 'object' && 
           node.directive.path.isVariableReference === true;
  }
}
```

#### Template Embed Handler

```typescript
/**
 * TemplateEmbedHandler - Handles embedding multi-line templates with variable interpolation
 * 
 * Example: @embed [[ Template with {{variables}} ]]
 */
class TemplateEmbedHandler extends BaseEmbedHandler {
  constructor(
    validationService: IValidationService,
    resolutionService: IResolutionService,
    stateService: IStateService,
    logger: ILogger
  ) {
    super(validationService, resolutionService, stateService, logger);
  }
  
  // Implement template-specific content retrieval
  protected async getContent(node: DirectiveNode, context: DirectiveContext): Promise<string> {
    // Get template content
    // Resolve variables in template
    // Return processed content
  }
  
  // Check if this is a template embed
  supportsNode(node: DirectiveNode): boolean {
    return typeof node.directive?.template === 'string';
  }
}
```

### 3. Factory/Manager Class

```typescript
/**
 * EmbedDirectiveHandler - Main handler that delegates to specialized handlers
 */
export class EmbedDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'embed';
  private handlers: IEmbedHandler[] = [];
  
  constructor(
    private validationService: IValidationService,
    private resolutionService: IResolutionService,
    private stateService: IStateService,
    private circularityService: ICircularityService,
    private fileSystemService: IFileSystemService,
    private parserService: IParserService,
    private interpreterService: IInterpreterService,
    private logger: ILogger = embedLogger,
    trackingService?: IStateTrackingService
  ) {
    // Initialize specialized handlers
    this.handlers.push(
      new FileEmbedHandler(validationService, resolutionService, stateService, circularityService, fileSystemService, logger),
      new VariableEmbedHandler(validationService, resolutionService, stateService, logger),
      new TemplateEmbedHandler(validationService, resolutionService, stateService, logger)
    );
  }
  
  // Main execution method - find appropriate handler and delegate
  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
    // Find handler that supports this node
    const handler = this.handlers.find(h => h.supportsNode(node));
    
    if (!handler) {
      throw new DirectiveError(
        'Unsupported embed directive format',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED
      );
    }
    
    // Delegate to specialized handler
    return handler.execute(node, context);
  }
}
```

### 4. AST Definition Updates

Update the `meld-spec` package to have more specific definitions:

```typescript
export interface EmbedDirectiveBase {
  kind: 'embed';
}

export interface FileEmbedDirective extends EmbedDirectiveBase {
  path: string;
  section?: string;
  headingLevel?: string;
  underHeader?: string;
  fuzzy?: string;
}

export interface VariableEmbedDirective extends EmbedDirectiveBase {
  path: VariableReference;
  section?: string;
  headingLevel?: string;
  underHeader?: string;
  fuzzy?: string;
}

export interface TemplateEmbedDirective extends EmbedDirectiveBase {
  template: string;
  section?: string;
  headingLevel?: string;
  underHeader?: string;
  fuzzy?: string;
}

export type EmbedDirectiveData = FileEmbedDirective | VariableEmbedDirective | TemplateEmbedDirective;
```

## Test Organization

Tests should be reorganized to clearly separate different embed types:

```
services/pipeline/DirectiveService/handlers/execution/
├─ embed/
│  ├─ FileEmbedHandler.test.ts
│  ├─ VariableEmbedHandler.test.ts
│  ├─ TemplateEmbedHandler.test.ts
│  ├─ BaseEmbedHandler.test.ts
│  ├─ EmbedDirectiveHandler.test.ts  // Integration tests
```

## Implementation Plan

1. **Phase 1: Refactoring**
   - Extract common functionality into a base class
   - Create specialized handlers for each embed type
   - Update factory class to delegate to specialized handlers
   - Update tests to use new structure
   - Ensure backward compatibility

2. **Phase 2: API Enhancement**
   - Update AST definitions
   - Update parser to recognize different embed types
   - Update validator to validate by embed type
   - Update documentation

3. **Phase 3: Test Refactoring**
   - Reorganize tests by embed type
   - Add specific test cases for each embed type
   - Add integration tests

## Benefits

1. **Clarity**: Each embed type has its own dedicated handler with clear responsibilities
2. **Maintainability**: Easier to maintain and extend each handler independently
3. **Testing**: Easier to write specific tests for each embed type
4. **Documentation**: Clear interfaces and examples for each embed type
5. **Extensibility**: Easier to add new embed types in the future

## Potential Challenges

1. **Backward Compatibility**: Ensure existing code and tests continue to work
2. **Migration Effort**: Significant refactoring required
3. **AST Changes**: May require updates to the parser and other components

## Conclusion

This proposal addresses the confusion around the different embed types by creating clear, well-defined handlers for each type. By separating concerns and creating explicit interfaces, the code will be easier to understand, maintain, and test.
