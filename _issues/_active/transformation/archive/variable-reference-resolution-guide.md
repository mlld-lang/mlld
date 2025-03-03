# Variable Reference Resolution Guide

## Problem Overview

The transformation system was not properly resolving variable references in the output. When variables were defined with text directives and then referenced in text content, those references weren't being replaced with their values in the transformed output.

## Key Components in Variable Resolution

Understanding the following components is crucial for diagnosing and fixing variable resolution issues:

1. **Text Nodes vs. TextVar Nodes**: The system processes different node types differently. Text nodes contain raw text content, while TextVar nodes specifically represent variable references.

2. **OutputService**: Responsible for converting nodes to various output formats (markdown, XML). The `nodeToMarkdown` method handles the transformation of different node types.

3. **ResolutionService**: Handles variable reference resolution through multiple resolvers. It's used to replace `{{variable}}` patterns with their actual values.

4. **StateService**: Stores and manages variables. Methods like `getTextVar` and `getDataVar` retrieve variable values.

5. **Transformation Mode**: Controls whether directive nodes should appear in the output and affects how variable references are processed.

## Common Issues in Variable Resolution

1. **Inconsistent Node Handling**: Different node types (Text, TextVar, DataVar) may have different resolution logics, leading to inconsistent variable handling.

2. **Transformation Flag Considerations**: The transformation flag can affect whether variable references are resolved. Some code paths might check this flag before attempting resolution.

3. **Missing Resolution Steps**: Some node types might not go through proper resolution processing, causing variable references to remain in the output.

4. **Error Handling Inconsistencies**: When variable resolution fails, the system might handle errors differently in different contexts.

## Solution Patterns

### 1. Direct Variable Resolution in Text Nodes

When handling Text nodes that might contain variable references:

```typescript
// Check if the content contains variable references
if (state.isTransformationEnabled() && content.includes('{{')) {
  const variableRegex = /\{\{([^{}]+)\}\}/g;
  let transformedContent = content;
  const matches = Array.from(content.matchAll(variableRegex));
  
  for (const match of matches) {
    const fullMatch = match[0]; // The entire match, e.g., {{variable}}
    const variableName = match[1].trim(); // The variable name, e.g., variable
    
    // Try to get the variable value from the state
    let value;
    // Try text variable first
    value = state.getTextVar(variableName);
    
    // If not found as text variable, try data variable
    if (value === undefined) {
      value = state.getDataVar(variableName);
    }
    
    // If a value was found, replace the variable reference with its value
    if (value !== undefined) {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      transformedContent = transformedContent.replace(fullMatch, stringValue);
    }
  }
  
  return transformedContent.endsWith('\n') ? transformedContent : transformedContent + '\n';
}
```

### 2. Using ResolutionService

For more complex resolution needs, use the ResolutionService:

```typescript
if (content.includes('{{') && this.resolutionService) {
  try {
    // Create appropriate resolution context for text variables
    const context: ResolutionContext = ResolutionContextFactory.forTextDirective(
      undefined, // current file path not needed here
      state // state service to use
    );
    
    // Use ResolutionService to resolve variables in text
    const resolvedContent = await this.resolutionService.resolveText(content, context);
    
    return resolvedContent.endsWith('\n') ? resolvedContent : resolvedContent + '\n';
  } catch (resolutionError) {
    // Fall back to original content if resolution fails
    return content.endsWith('\n') ? content : content + '\n';
  }
}
```

### 3. Comprehensive Logging

Add detailed logging to track variable resolution:

```typescript
logger.debug('Looking up variable in state', {
  variableName,
  value: value !== undefined ? (typeof value === 'string' ? value : JSON.stringify(value)) : 'undefined'
});

logger.debug('Replaced variable reference in Text node', {
  variableName,
  value: stringValue,
  fullMatch,
  before: content,
  after: transformedContent
});
```

## Implementation Lessons

1. **Always Check Multiple Variable Types**: When resolving variables, always check both text and data variables:
   ```typescript
   // Try text variable first
   value = state.getTextVar(variableName);
   
   // If not found as text variable, try data variable
   if (value === undefined) {
     value = state.getDataVar(variableName);
   }
   ```

2. **Handle Edge Cases in Text Processing**: Ensure proper handling of edge cases like newlines and string conversion:
   ```typescript
   return transformedContent.endsWith('\n') ? transformedContent : transformedContent + '\n';
   ```

3. **Consistent Error Handling**: Implement consistent error handling across all resolution paths:
   ```typescript
   try {
     // Resolve variables
   } catch (resolutionError) {
     logger.error('Error resolving variable references', { content, error: resolutionError });
     // Fall back to original content
     return content;
   }
   ```

4. **Safe Type Handling**: Always handle different data types safely, especially when converting to strings:
   ```typescript
   const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
   ```

5. **Ensure All Node Types Are Processed**: Check that all node types that might contain variable references have resolution logic:
   - Text nodes (plain text with possible {{variable}} references)
   - TextVar nodes (representing direct variable references)
   - DataVar nodes (representing structured data with possible variable references)

## Testing Strategies

1. **Create Specific Test Cases**: Create detailed test cases targeting each variable resolution scenario:
   - Simple text variables
   - Data variables with field access
   - Nested variables (variables referencing other variables)
   - Variables in different node types

2. **Add Debug Logging in Tests**: Include logging statements in tests to track variable values and resolution steps:
   ```typescript
   console.log('DEBUG - Variables set directly in state:');
   console.log('DEBUG - var1:', stateService.getTextVar('var1'));
   ```

3. **Test Each Resolution Path**: Ensure tests cover each of the possible resolution paths in your code.

4. **Test With and Without Transformation**: Test variable resolution with transformation enabled and disabled to ensure consistent behavior.

## System Architecture Insights

1. **Separation of Concerns**: The transformation system and variable resolution are closely connected but separate concerns:
   - Transformation controls whether directive nodes should appear in the output
   - Variable resolution determines how variable references are processed

2. **Resolution Context**: Always create the appropriate resolution context for different directive types:
   ```typescript
   const context = ResolutionContextFactory.forTextDirective(
     undefined, // current file path not needed here
     state // state service to use
   );
   ```

3. **State Management**: The state service is central to variable resolution:
   - It stores all variable values
   - It handles transformation settings
   - It manages variable scopes

4. **Service Initialization Order**: Ensure services are properly initialized and connected:
   - OutputService needs access to StateService for retrieving variables
   - OutputService needs access to ResolutionService for resolving variable references
   - StateService initialization must happen before variable resolution attempts

By understanding these patterns and implementing them consistently, you can ensure reliable variable resolution throughout the system, regardless of the context in which variables are used. 