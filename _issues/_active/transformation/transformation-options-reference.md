# Transformation Options Reference

This document provides a reference for the selective transformation options in Meld.

## Overview

Transformation mode in Meld determines whether directives and variables are processed/replaced or left as raw text:

- When **enabled**: `@text greeting = "Hello"` and `{{greeting}}` are processed, resulting in just "Hello" in the output.
- When **disabled**: Directives and variables remain unchanged in the output.

## Selective Transformation

Instead of all-or-nothing transformation, Meld supports selective transformation options to control which elements are transformed:

```typescript
interface TransformationOptions {
  variables?: boolean;    // Transform variable references
  directives?: boolean;   // Transform directive content
  commands?: boolean;     // Execute commands
  imports?: boolean;      // Process imports
}
```

## Using Transformation Options

### In API Calls

```typescript
// Enable transformation with specific options
const result = await main('file.meld', {
  fs: context.fs,
  services: context.services,
  transformation: {
    variables: true,     // Replace variables with values
    directives: true,    // Process directives
    commands: false,     // Don't execute commands (safer for testing)
    imports: true        // Process imports
  }
});
```

### In StateService

```typescript
// Enable selective transformation
stateService.enableTransformation({
  variables: true,
  directives: true,
  commands: false,
  imports: true
});

// Check if specific transformation type is enabled
if (stateService.shouldTransform('variables')) {
  // Handle variable transformation
}

// Legacy all-or-nothing approach
stateService.enableTransformation(true);  // Enable all
stateService.enableTransformation(false); // Disable all
```

## Implementation Details

The `StateService` maintains transformation state with these key methods:

```typescript
enableTransformation(options?: TransformationOptions | boolean): void {
  if (typeof options === 'boolean') {
    // Legacy behavior - all on or all off
    this._transformationEnabled = options;
    this._transformationOptions = options ? 
      { variables: true, directives: true, commands: true, imports: true } : 
      { variables: false, directives: false, commands: false, imports: false };
  } else {
    // Selective transformation
    this._transformationEnabled = true;
    this._transformationOptions = {
      ...{ variables: true, directives: true, commands: true, imports: true },
      ...options
    };
  }

  // Initialize transformed nodes when enabling transformation
  if (this._transformationEnabled && !this.currentState.transformedNodes) {
    this.updateState({ transformedNodes: [...this.currentState.nodes] }, 'enableTransformation');
  }
}

// Check if transformation is enabled at all
isTransformationEnabled(): boolean {
  return this._transformationEnabled;
}

// Check if specific transformation type is enabled
shouldTransform(type: keyof TransformationOptions): boolean {
  return this._transformationEnabled && 
         this._transformationOptions[type] === true;
}

// Get all transformation options
getTransformationOptions(): TransformationOptions {
  return { ...this._transformationOptions };
}
```

## Usage in Resolvers

Resolvers should check whether specific transformation types are enabled:

```typescript
// In VariableReferenceResolver
resolveNodes(nodes: MeldNode[], context: ResolutionContext): MeldNode[] {
  // Only transform if variables transformation is enabled
  if (!context.state?.shouldTransform('variables')) {
    return nodes;
  }
  
  // Process variables...
}

// In DirectiveResolver
resolveDirectives(nodes: MeldNode[], context: ResolutionContext): MeldNode[] {
  // Only transform if directives transformation is enabled
  if (!context.state?.shouldTransform('directives')) {
    return nodes;
  }
  
  // Process directives...
}
```

## Common Testing Patterns

### Testing Variable-Only Transformation

```typescript
it('should transform variables but not directives', async () => {
  context.fs.writeFileSync('test.meld', '@text greeting = "Hello"\n{{greeting}}');

  const result = await main('test.meld', {
    fs: context.fs,
    services: context.services,
    transformation: { 
      variables: true,    // Transform variables
      directives: false   // Don't transform directives
    }
  });
  
  // Directive should remain unchanged, variable should be transformed
  expect(result).toContain('@text greeting = "Hello"'); // Raw directive preserved
  expect(result).toContain('Hello');                    // Variable transformed
});
```

### Testing Directive-Only Transformation

```typescript
it('should transform directives but not execute commands', async () => {
  context.fs.writeFileSync('test.meld', 
    '@run [echo "Hello"]\n@text greeting = "Hello"');

  const result = await main('test.meld', {
    fs: context.fs,
    services: context.services,
    transformation: { 
      variables: true,    // Transform variables
      directives: true,   // Transform directives
      commands: false     // Don't execute commands
    }
  });
  
  // Command directive should remain, text directive should be processed
  expect(result).toContain('@run [echo "Hello"]');  // Raw command preserved
  expect(result).not.toContain('@text greeting');   // Text directive processed
  expect(result).toContain('Hello');               // Variable value present
});
```

### Testing Import Without Commands

```typescript
it('should process imports but not execute commands', async () => {
  context.fs.writeFileSync('imported.meld', 
    '@text importedVar = "Imported content"\n@run [echo "test"]');
  context.fs.writeFileSync('test.meld', 
    '@import imported.meld\n{{importedVar}}');

  const result = await main('test.meld', {
    fs: context.fs,
    services: context.services,
    transformation: { 
      variables: true,    // Transform variables
      directives: true,   // Transform directives
      commands: false,    // Don't execute commands
      imports: true       // Process imports
    }
  });
  
  // Import should be processed, variables from import available,
  // but commands should not be executed
  expect(result).not.toContain('@import');             // Import directive processed
  expect(result).toContain('Imported content');        // Imported variable available
  expect(result).toContain('@run [echo "test"]');      // Command not executed
});
```

## Benefits of Selective Transformation

1. **Testing Safety**: Tests can transform variables and directives without executing potentially harmful commands.

2. **Partial Processing**: Users can choose which elements to process for different use cases.

3. **Debugging**: Developers can selectively enable transformations to isolate issues in specific parts of the system.

4. **Preview Mode**: Applications can implement preview modes that show some processed content while preserving other elements.

5. **Performance**: Skipping unnecessary transformations can improve performance for large documents.

## Best Practices

1. **Be Explicit**: Always explicitly specify which transformation options you want, rather than relying on defaults.

2. **Test All Combinations**: Create tests that verify each combination of transformation options behaves as expected.

3. **Use Strict Mode**: When using transformation options, also consider using `strict: true` in the interpreter options to ensure errors are properly propagated.

4. **Debug With Logging**: When debugging transformation issues, log the current transformation state:
   ```typescript
   console.log('Transformation state:', {
     enabled: stateService.isTransformationEnabled(),
     options: stateService.getTransformationOptions(),
     variablesEnabled: stateService.shouldTransform('variables'),
     directivesEnabled: stateService.shouldTransform('directives')
   });
   ```

5. **Consider Dependencies**: Be aware that some transformations may depend on others (e.g., variable resolution might depend on import processing). 