# OutputService Feedback on Embed Types

## Overview

As the lead for the OutputService team, I've reviewed the proposed embed type definitions in `embed.types.ts`. Our service is responsible for the final stage of the Meld pipeline, taking transformed nodes and generating clean output in the requested format (markdown or LLM XML).

## Core Requirements for OutputService

For the OutputService to properly handle embedded content, we need:

1. **Complete Transformation Information**: We need the final content after all transformations and variable resolutions that should happen prior to output generation.

2. **Clear Variable Resolution Boundaries**: We need to know which variables have already been resolved vs. which ones our service should resolve during output generation.

3. **Output Format Context**: We need to know if any special formatting rules apply to the embedded content.

4. **Content Type Information**: We need to know the original source type to apply appropriate escaping rules.

## Specific Feedback on Proposed Types

The current types provide a good foundation, but have some gaps from the OutputService perspective:

### 1. Transformation Information Enhancement

```typescript
transformationInfo: {
  isTransformed: boolean;
  originalNodeId?: string;
  transformedContent?: string;
  // Need to add:
  contentFormat?: 'text' | 'markdown' | 'code' | 'html'; 
  needsVariableResolution: boolean;
  // Critical for resolving variables during output
  isInTransformationMode: boolean;
}
```

We need to know the format of the content, whether it still needs variable resolution, and whether we're operating in transformation mode.

### 2. Variable Resolution Status

For our two architecture models (traditional and delegated):

```typescript
variableResolutionInfo: {
  // For delegated architecture with ResolutionService
  hasResolvedVariables: boolean;
  // For traditional architecture where OutputService handles resolution
  pendingVariables?: string[]; // Variables that still need resolution
  // Context for resolution
  resolutionContext?: {
    disablePathPrefixing: boolean;
    allowHtmlEscaping: boolean;
    featureFlags: {
      resolveVariablesInOutput: boolean; // Corresponds to MELD_DISABLE_OUTPUT_VARIABLE_RESOLUTION
    }
  }
}
```

### 3. Format-Specific Properties

Since OutputService handles different output formats:

```typescript
outputFormatting: {
  preserveNewlines: boolean;
  preserveIndentation: boolean;
  renderAsCodeBlock?: boolean;
  codeLanguage?: string; // For code blocks
  specialFormatting?: 'preformatted' | 'verbatim' | 'raw';
  // Add this critical property for the client interface
  targetFormat: 'markdown' | 'llm' | string;
}
```

### 4. Content Source Information

```typescript
contentSource: {
  isFromFile: boolean;
  originalFileType?: string; // e.g., 'md', 'txt', 'csv'
  originalFilePath?: string; // For debugging and error reporting
  // Add support for client interface pattern
  resolverClient?: {
    type: 'VariableReferenceResolverClient' | 'ResolutionServiceClient';
    clientId?: string;
  }
}
```

## Specific Issues with Current Types

1. **Missing Content Format Metadata**: We can't tell if embedded content should be treated as plain text, markdown, or code.

2. **Unclear Variable Resolution Responsibility**: The types don't indicate which variables have been resolved vs. which ones our service needs to resolve.

3. **Lack of Output-Specific Properties**: No information about how to format the content in the final output.

4. **Insufficient Transformation Context**: The `transformedContent` property is good, but lacks metadata about how the content was transformed and what additional processing it might need.

5. **Missing Client Interface Support**: The types don't account for the client interface pattern used throughout the codebase for handling circular dependencies.

6. **No Feature Flag Integration**: There's no indication of which feature flags might affect the processing of embedded content.

## Proposed Type Enhancements

I recommend enhancing the base type with these additional properties:

```typescript
interface BaseEmbedDirective {
  // Existing properties...
  
  // Add these properties for OutputService
  contentInfo: {
    format: 'text' | 'markdown' | 'code' | 'html';
    needsVariableResolution: boolean;
    pendingVariables?: string[];
    preserveFormatting: boolean;
    codeLanguage?: string;
  };
  
  outputOptions: {
    escapeHtml: boolean;
    renderAsBlock: boolean;
    disablePathPrefixing: boolean;
    preserveNewlines: boolean;
    targetFormat?: 'markdown' | 'llm' | string;
  };
  
  // Add support for client interfaces
  clients?: {
    variableResolver?: {
      type: 'direct' | 'client';
      clientFactoryToken?: string;
    };
    resolutionService?: {
      type: 'direct' | 'client';
      clientFactoryToken?: string;
    };
  };
  
  // Add error handling information
  errorHandling?: {
    onResolutionFailure: 'throw' | 'preserve' | 'empty';
    onTransformationFailure: 'throw' | 'original' | 'empty';
    errorMessage?: string;
  };
  
  // Feature flags that affect processing
  featureFlags?: {
    resolveVariablesInOutput: boolean;
    transformDirectives: boolean;
  };
}
```

## Implementation Considerations

If these types are implemented, OutputService could streamline its handling of embedded content with a clean architecture following these principles:

1. **Client Factory Pattern**: Use the client factory pattern to handle potential circular dependencies with ResolutionService

```typescript
// Example of how OutputService would use these types with the client factory pattern
private processEmbedDirective(embedNode: BaseEmbedDirective): string {
  // Get resolver client using the client factory pattern if needed
  let resolver: IVariableReferenceResolverClient | undefined;
  
  if (embedNode.clients?.variableResolver?.type === 'client' && 
      embedNode.contentInfo.needsVariableResolution) {
    try {
      const factory = resolveService<VariableReferenceResolverClientFactory>(
        embedNode.clients.variableResolver.clientFactoryToken || 'VariableReferenceResolverClientFactory'
      );
      resolver = factory.createClient();
    } catch (error) {
      // Handle error based on embedNode.errorHandling
    }
  }
  
  // Proceed with appropriate rendering based on available options and clients
  // ...
}
```

2. **Feature Flag Awareness**: Check appropriate feature flags before performing variable resolution

```typescript
// Example of feature flag handling
const shouldResolveVariables = embedNode.featureFlags?.resolveVariablesInOutput ?? 
  !process.env.MELD_DISABLE_OUTPUT_VARIABLE_RESOLUTION;

if (shouldResolveVariables && embedNode.contentInfo.needsVariableResolution) {
  // Perform variable resolution with appropriate client
}
```

3. **Format-Specific Processing**: Handle content based on format information

```typescript
// Example of format-specific handling
switch (embedNode.contentInfo.format) {
  case 'code':
    return this.renderCodeBlock(
      embedNode.transformationInfo.transformedContent || '',
      embedNode.contentInfo.codeLanguage,
      embedNode.outputOptions
    );
  case 'markdown':
    return this.renderMarkdown(
      embedNode.transformationInfo.transformedContent || '',
      embedNode.outputOptions
    );
  // Other formats...
}
```

This implementation would align with Meld's DI architecture and the existing client factory pattern while providing clear separation of concerns. 