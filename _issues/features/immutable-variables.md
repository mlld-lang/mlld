# Immutable Variables Proposal

## Problem Statement

Currently, Meld allows variables to be redefined throughout a document, which:

1. Makes it difficult to reason about variable values at any given point
2. Creates potential bugs when variables are unexpectedly redefined
3. Increases cognitive load when debugging Meld scripts
4. Can lead to unexpected results when imported files redefine variables

Enforcing variable immutability would address these issues and align better with Meld's purpose of creating modular LLM prompts with deterministic behavior.

## Alignment with Meld's Purpose

Meld's primary purpose is to create scripts that build LLM prompts, helping to surgically assemble context in a modular way. In this use case:

1. **Clarity is Essential**: LLM prompts should be deterministic and clear
2. **Modularity is Key**: Each piece of context should be well-defined and consistent
3. **Reasoning about Output**: Immutability makes it easier to reason about what context is included
4. **Debugging Simplicity**: When a variable is defined, knowing it won't change elsewhere simplifies debugging

Immutability aligns perfectly with these needs, as it eliminates an entire class of issues related to variable redefinition.

## Current Variable Behavior

Currently, Meld allows variables to be redefined with statements like:

```
@text greeting = "Hello"
@text greeting = "Hi there"  # Overwrites the previous value
```

This behavior exists in the following directive handlers:

1. **TextDirectiveHandler**: Allows redefinition of text variables
2. **DataDirectiveHandler**: Allows redefinition of data variables
3. **PathDirectiveHandler**: Allows redefinition of path variables

Additionally, variables can be overwritten during the import process, potentially causing unexpected behavior.

## Implementation Approach

### 1. Modify Directive Handlers to Check for Existing Variables

```typescript
// In TextDirectiveHandler.execute
async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
  this.validationService.validate(node);
  
  const { name, value } = node.directive as TextDirectiveParams;
  
  // Check if variable already exists
  if (context.state.getTextVar(name) !== undefined) {
    throw new DirectiveError(
      `Variable '${name}' is already defined. Variables in Meld are immutable.`,
      this.kind,
      DirectiveErrorCode.VARIABLE_ALREADY_DEFINED, // New error code
      { node, severity: DirectiveErrorSeverity.ERROR }
    );
  }
  
  // Proceed with existing logic
  const resolvedValue = await this.resolutionService.resolveInContext(
    value,
    ResolutionContextFactory.forDirective(context.currentFilePath, context.state, ['textVars'])
  );
  
  context.state.setTextVar(name, resolvedValue);
  
  // Existing code for transformation, etc.
}
```

Similar changes for DataDirectiveHandler and PathDirectiveHandler.

### 2. Add Directive Error Code

```typescript
// In DirectiveErrorCode enum
export enum DirectiveErrorCode {
  // Existing codes...
  VARIABLE_ALREADY_DEFINED = 'variable-already-defined'
}
```

### 3. Modify Import Handler to Check for Conflicts

```typescript
// In ImportDirectiveHandler.importAllVariables
private importAllVariables(sourceState: IStateService, targetState: IStateService): void {
  // Existing tracking code...
  
  // Import text variables with conflict checking
  const textVars = sourceState.getAllTextVars();
  textVars.forEach((value, name) => {
    if (targetState.getTextVar(name) !== undefined) {
      throw new DirectiveError(
        `Imported variable '${name}' conflicts with existing variable. Variables in Meld are immutable.`,
        'import',
        DirectiveErrorCode.IMPORT_VARIABLE_CONFLICT,
        { severity: DirectiveErrorSeverity.ERROR }
      );
    }
    
    targetState.setTextVar(name, value);
    this.trackVariableCrossing(name, 'text', sourceState, targetState);
  });
  
  // Similar changes for data variables, path variables and commands...
}
```

### 4. Add Options for Selective Import

To provide flexibility when working with imports, add an explicit import syntax:

```typescript
// In ImportDirectiveHandler
// Support for explicit import syntax:
// @import [path="utils.meld", include=["var1", "var2"]]
```

### 5. Add Configuration Option for Backward Compatibility

```typescript
// In StateServiceConfig
export interface StateServiceConfig {
  // Existing options...
  enforceImmutability?: boolean; // Defaults to true in new code
}

// In StateService constructor
constructor(config?: StateServiceConfig) {
  this.enforceImmutability = config?.enforceImmutability ?? true;
}
```

## Code Impact Analysis

The following files would need to be modified:

### 1. Directive Handlers:

- `services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.ts`
- `services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler.ts`
- `services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler.ts`
- `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.ts`
- `services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.ts`

### 2. Support Types:

- `services/pipeline/DirectiveService/errors/DirectiveError.ts` (for new error codes)
- `services/state/StateService/StateService.ts` (for configuration option)

### 3. Tests:

- Update existing tests that rely on variable redefinition
- Add new tests specifically for immutability enforcement
- Update integration tests that may rely on variable redefinition

## Edge Cases and Considerations

### 1. Handling Command Output

Commands that output to variables need special handling:

```typescript
// In RunDirectiveHandler.execute
if (node.directive.output) {
  // Check if output variable already exists
  if (context.state.getTextVar(node.directive.output) !== undefined) {
    throw new DirectiveError(
      `Cannot output to variable '${node.directive.output}' as it already exists. Variables in Meld are immutable.`,
      this.kind,
      DirectiveErrorCode.VARIABLE_ALREADY_DEFINED
    );
  }
  
  // Set the output variable
  context.state.setTextVar(node.directive.output, stdout);
}
```

### 2. Generated Variable Names

In cases where variable names are generated dynamically:

```typescript
// Ensure uniqueness when generating variable names
const uniqueName = this.generateUniqueName(baseName, context.state);

function generateUniqueName(baseName: string, state: IStateService): string {
  if (state.getTextVar(baseName) === undefined) {
    return baseName;
  }
  
  // This should ideally never happen with properly designed code
  throw new DirectiveError(
    `Cannot generate a unique name for '${baseName}'. Variables in Meld are immutable.`,
    this.kind,
    DirectiveErrorCode.VARIABLE_ALREADY_DEFINED
  );
}
```

### 3. Template-like Use Cases

For template-like use cases where users might want to modify content:

```
@text greeting = "Hello"
@text formal_greeting = "{{greeting}}, esteemed colleague"
@text casual_greeting = "{{greeting}}, friend"
```

This pattern encourages composability rather than mutation.

### 4. Accumulating Content

For cases where content needs to be built up:

```
@text part1 = "First part"
@text part2 = "Second part"
@text combined = "{{part1}} {{part2}}"
```

## Migration Strategy

To implement immutability with minimal disruption:

1. **Add Configuration Option**: Allow temporarily disabling immutability enforcement.
2. **Update Documentation**: Clearly document that variable redefinition is deprecated.
3. **Implement with Warning First**: Initially issue warnings for redefinition before throwing errors.
4. **Provide Migration Guide**: Document patterns for replacing redefinition with immutable alternatives.
5. **Update Tests**: Ensure all tests pass with immutability enforced.
6. **Full Enforcement**: After a transition period, make immutability the only option.

## Testing Plan

1. **Unit Tests**: Add tests for each directive handler to verify immutability enforcement.
2. **Integration Tests**: Test complex interactions between directives to ensure proper enforcement.
3. **Edge Case Tests**: Test specific edge cases like imports, commands, and dynamic variable names.
4. **Backward Compatibility**: Test the configuration option for backward compatibility.

## Documentation Updates

1. **Add immutability to core principles** in the documentation.
2. **Update examples** to follow immutable patterns.
3. **Document error messages** related to immutability.
4. **Add a migration guide** for users transitioning from mutable variables.

## Conclusion

Implementing immutable variables in Meld aligns perfectly with its purpose of creating clear, modular LLM prompts. By enforcing immutability, we eliminate an entire class of bugs related to variable redefinition and make Meld scripts more predictable and easier to reason about.

The implementation approach outlined here provides a clear path forward while addressing edge cases and allowing for a smooth transition. It builds on the architectural principles of Meld and enhances them with stronger guarantees about variable behavior. 