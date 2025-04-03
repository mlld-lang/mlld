# DirectiveService Feedback on Embed Types

## Overview

As the team responsible for the DirectiveService, we've reviewed the draft types in `embed.types.ts` and evaluated how they would integrate with our service responsibilities and interactions with other services in the pipeline.

## Current DirectiveService Requirements

Our service:
1. Routes directives to appropriate handlers
2. Validates directives using ValidationService
3. Calls ResolutionService for variable resolution
4. Updates StateService after directive execution
5. Supports node transformation for output
6. Must correctly handle all three embed types

## Service Interactions

When processing embed directives, we interact with several other services:

- **ValidationService**: Validates directive syntax and constraints
- **ResolutionService**: Resolves variables, path references, and templates
- **StateService**: Maintains state during directive execution and transformation
- **FileSystemService**: Reads embedded file content for path embeds
- **PathService**: Resolves and validates paths for file embeds
- **InterpreterService**: Handles node transformations based on directive results

These interactions require specific data to be captured in our type definitions.

## Analysis of Proposed Types

The proposed BaseEmbedDirective and its extensions provide a solid foundation but require some refinements for our service to operate effectively.

### Strengths

- Clear type discrimination with the `subtype` field
- Inclusion of location tracking for transformation
- State management properties for child state creation
- Transformation tracking fields

### Gaps and Improvement Opportunities

1. **Resolution Context Information**:
   - Missing fields to track resolution context options
   - Need `disablePathPrefixing` flag for variable embeds
   - Need `allowedVariableTypes` for security/validation

2. **For EmbedPathDirective**:
   - `resolvedPath` is present, but we need a flag to track resolution status
   - Missing field to indicate if path has variable references
   - Need metadata for file reading operations (encoding, binary mode)

3. **For EmbedVariableDirective**:
   - `fieldPath` is insufficient for complex access patterns
   - Need structured representation for array index access
   - No clear way to track original variable reference syntax
   - Missing data for validation against restricted variable types

4. **For EmbedTemplateDirective**:
   - `variableReferences` is helpful but needs structure
   - Missing field to track if first newline was stripped
   - Need field for resolved template content
   - Need tracking for circular dependency detection

5. **Handler Result Information**:
   - Missing fields to store handler processing results
   - Need content status field (loaded, resolved, error)
   - Need error tracking for failed resolutions
   - Need fields for tracking replacement nodes for transformation

6. **State Management Data**:
   - Need clearer fields for managing state inheritance and scope
   - Missing data to track variables copied between states
   - Need flags for when to inherit parent state variables

7. **Execution Context Information**:
   - Need context about current file being processed
   - Need reference to parent directive if nested
   - Need tracking of execution chain for circular dependency detection

## Suggested Additions

We recommend enhancing the types with:

```typescript
interface ResolutionContext {
  disablePathPrefixing: boolean;
  allowedVariableTypes: {
    text: boolean;
    data: boolean;
    path: boolean;
  };
  currentFile?: string;
  executionChain?: string[]; // For circular dependency tracking
}

interface EmbedPathDirective extends BaseEmbedDirective {
  subtype: 'embedPath';
  originalPath: string; // Preserve original before resolution
  path: string; // Current path after resolution
  resolvedPath?: string;
  hasPathVariables: boolean;
  resolutionStatus: 'pending' | 'resolved' | 'error';
  resolutionError?: string;
  fileOptions?: {
    encoding?: string;
    isBinary?: boolean;
    maxSize?: number;
  };
  handlerResult?: {
    content?: string;
    error?: string;
    transformedNodes?: MeldNode[];
  };
}

interface VariableAccessPath {
  segments: Array<{
    type: 'property' | 'index';
    value: string | number;
  }>;
  original: string; // Original access syntax
}

interface EmbedVariableDirective extends BaseEmbedDirective {
  subtype: 'embedVariable';
  variable: {
    name: string;
    accessPath?: VariableAccessPath; // Instead of simple fieldPath
    valueType: 'text' | 'data';
    originalReference: string; // The full {{variable.path}} reference
  };
  resolutionStatus: 'pending' | 'resolved' | 'error';
  resolvedValue?: string | object;
  handlerResult?: {
    content?: string;
    error?: string;
    transformedNodes?: MeldNode[];
  };
  validationInfo?: {
    allowedTypes: ('text' | 'data' | 'path')[];
    restrictedFields?: string[];
  };
}

interface EmbedTemplateDirective extends BaseEmbedDirective {
  subtype: 'embedTemplate';
  template: string; // Original template
  processedTemplate?: string; // After newline processing
  resolvedTemplate?: string; // After variable resolution
  firstNewlineStripped: boolean;
  variableReferences: Array<{
    reference: string;
    start: number;
    end: number;
    resolved?: boolean;
    variableName: string;
    accessPath?: string;
  }>;
  resolutionStatus: 'pending' | 'resolved' | 'error';
  handlerResult?: {
    content?: string;
    error?: string;
    transformedNodes?: MeldNode[];
  };
  circularDependencyInfo?: {
    checked: boolean;
    isCircular: boolean;
    path?: string[];
  };
}

// Common extended information for all embed types
interface BaseEmbedDirective {
  // Common properties for all embed types
  type: 'EmbedDirective';
  subtype: 'embedPath' | 'embedVariable' | 'embedTemplate';
  
  // Location info needed for transformation tracking
  location: {
    start: { line: number; column: number; };
    end: { line: number; column: number; };
    source?: string;
    sourceFile?: string; // Important for error reporting
  };
  
  // State management properties
  stateInfo: {
    createsChildState: boolean;
    inheritVariables: boolean;
    parentStateId?: string;
    childStateId?: string;
    variablesToCopy?: string[]; // Which variables to copy to parent
  };
  
  // Transformation tracking
  transformationInfo: {
    isTransformed: boolean;
    originalNodeId?: string;
    transformedContent?: string;
    replacementNodes?: MeldNode[];
    transformationTime?: number; // For performance tracking
  };

  // Execution context
  executionContext?: {
    currentFile: string;
    parentDirectiveId?: string;
    executionDepth: number;
    executionPath: string[];
  };
}
```

## Impact on Service Implementation

With these enhanced types, our service implementations would benefit in several ways:

1. **DirectiveService**:
   - Clearer routing of embed subtypes to appropriate handlers
   - Better tracking of directive execution state
   - Improved error reporting with more context

2. **EmbedDirectiveHandler**:
   - More structured approach to handling different embed types
   - Better type safety when processing each embed subtype
   - Clearer interface with ResolutionService for variable resolution

3. **Directive Validation**:
   - More specific validation based on embed subtype
   - Better context for error messages
   - Structured validation of complex properties

4. **Transformation Support**:
   - Clearer tracking of transformation status
   - Better structured replacement node handling
   - Improved pipeline integration

## Conclusion

The current types are a good starting point but need enhancements to support the full range of functionality required by the DirectiveService and its interactions with other services in the pipeline. With the suggested additions, we could implement cleaner, more maintainable directive handlers with better type safety.

Our changes focus on:
1. More detailed tracking of the resolution process
2. Better structure for complex variable access
3. Fields to support the specific requirements of each embed type
4. Error handling and status tracking
5. Improved state management and inheritance
6. Better execution context for circular dependency detection
7. Enhanced transformation tracking

These improvements would allow the DirectiveService to properly implement the semantics described in the EMBED-CLARITY.md document while maintaining clean separation of concerns across the pipeline and supporting all the necessary interactions with other services. 