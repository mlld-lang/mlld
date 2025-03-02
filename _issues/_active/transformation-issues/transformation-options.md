# Selective Transformation Options

## Current Limitations

Currently, transformation mode in Meld operates in an all-or-nothing manner:

```typescript
// In StateService.ts
enableTransformation(): void {
  this.transformationEnabled = true;
}

disableTransformation(): void {
  this.transformationEnabled = false;
}

isTransformationEnabled(): boolean {
  return this.transformationEnabled;
}
```

This means that when transformation is enabled, all transformations happen:
- Variables are resolved
- Directives are processed
- Commands are executed
- Imports are processed

This makes testing difficult because there's no way to selectively enable just variable transformation without also enabling command execution, for example.

## Proposed Enhancement

We propose implementing selective transformation options to give more granular control:

```typescript
export interface TransformationOptions {
  variables?: boolean;    // Transform variable references
  directives?: boolean;   // Transform directive content
  commands?: boolean;     // Execute commands
  imports?: boolean;      // Process imports
}
```

### Implementation in StateService

```typescript
export class StateService {
  private transformationEnabled: boolean = false;
  private transformationOptions: TransformationOptions = {
    variables: false,
    directives: false,
    commands: false,
    imports: false
  };

  /**
   * Enable transformation with specific options
   * @param options Options for selective transformation, or true/false for all
   */
  enableTransformation(options?: TransformationOptions | boolean): void {
    if (typeof options === 'boolean') {
      // Legacy behavior - all on or all off
      this.transformationEnabled = options;
      this.transformationOptions = options ? 
        { variables: true, directives: true, commands: true, imports: true } : 
        { variables: false, directives: false, commands: false, imports: false };
    } else {
      // Selective transformation
      this.transformationEnabled = true;
      this.transformationOptions = {
        ...{ variables: true, directives: true, commands: true, imports: true },
        ...options
      };
    }
  }

  /**
   * Disable transformation entirely
   */
  disableTransformation(): void {
    this.transformationEnabled = false;
    this.transformationOptions = {
      variables: false,
      directives: false,
      commands: false,
      imports: false
    };
  }

  /**
   * Check if a specific transformation type is enabled
   */
  shouldTransform(type: keyof TransformationOptions): boolean {
    return this.transformationEnabled && this.transformationOptions[type];
  }

  /**
   * Legacy check if transformation is enabled at all
   */
  isTransformationEnabled(): boolean {
    return this.transformationEnabled;
  }
}
```

### Using Selective Transformation in Resolvers

```typescript
export class VariableReferenceResolver {
  // ...

  resolveNodes(nodes: MeldNode[], context: ResolutionContext): MeldNode[] {
    // Check if variable transformation specifically is enabled
    if (!this.stateService.shouldTransform('variables') || !nodes || nodes.length === 0) {
      return nodes;
    }

    // Process only if variable transformation is enabled
    return nodes.map(node => this.resolveNode(node, context));
  }

  // ...
}

export class DirectiveResolver {
  // ...

  resolveDirectives(nodes: MeldNode[], context: ResolutionContext): MeldNode[] {
    // Check if directive transformation specifically is enabled
    if (!this.stateService.shouldTransform('directives') || !nodes || nodes.length === 0) {
      return nodes;
    }

    // Process only if directive transformation is enabled
    return nodes.map(node => this.resolveDirective(node, context));
  }

  // ...
}
```

### Using in Tests

The selective transformation options are particularly valuable in testing, where we might want to test specific transformation behaviors:

```typescript
// Test variable resolution without directive processing
it('should resolve variables but preserve raw directives', async () => {
  context.fs.writeFileSync('test.meld', '@text greeting = "Hello"\n{{greeting}}');

  // Enable only variable transformation
  context.enableTransformation({ 
    variables: true,
    directives: false 
  });
  
  const result = await main('test.meld', {
    fs: context.fs,
    services: context.services,
    // Explicitly pass transformation options
    transformation: { variables: true, directives: false }
  });
  
  // Verify that variables are transformed but directives are preserved
  expect(result).toContain('@text greeting = "Hello"'); // Raw directive preserved
  expect(result).toContain('Hello');                    // Variable transformed
});

// Test directive processing without command execution
it('should process directives but not execute commands', async () => {
  context.fs.writeFileSync('test.meld', '@run [echo "Hello"]\n@text greeting = "Hello"');

  // Enable directive processing but not commands
  context.enableTransformation({ 
    variables: true,
    directives: true,
    commands: false
  });
  
  const result = await main('test.meld', {
    fs: context.fs,
    services: context.services,
    transformation: { variables: true, directives: true, commands: false }
  });
  
  // Verify that directives are processed but commands aren't executed
  expect(result).toContain('@run [echo "Hello"]');   // Raw command preserved
  expect(result).not.toContain('@text greeting');    // Text directive processed
  expect(result).toContain('Hello');                // Variable value present
});
```

## Benefits of This Approach

1. **Better Testing Control**: Tests can now selectively enable only the transformation aspects they're testing.

2. **Clearer Test Intent**: Tests explicitly declare what transformation behavior they expect.

3. **Safer Command Testing**: Tests can process directives without actually executing commands.

4. **More Flexible Configuration**: Applications using Meld can customize transformation behavior.

5. **Backwards Compatibility**: The existing `isTransformationEnabled()` method continues to work for simpler cases.

## Migration Strategy

1. Update `StateService` to support the new options
2. Update resolvers to check for specific transformation types
3. Add helper functions to simplify common transformation patterns
4. Update tests to use selective transformation where appropriate
5. Document the new capabilities and patterns

This enhancement allows much more precise control over transformation behavior while maintaining backward compatibility and making tests clearer and more robust. 