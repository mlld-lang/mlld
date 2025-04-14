# Consolidated Requirements for Meld's Internal Variable Handling

## Core Type Structure

1. **Base Variable Interface**
   - Define `IVariable<T>` interface with:
     - `type: VariableType` discriminant property
     - `value: T` for strongly-typed values
     - `metadata?: VariableMetadata` for tracking history
   - Implement discriminated unions for type safety

2. **Variable Types**
   - Define `VariableType` enum with `TEXT`, `DATA`, `PATH`, and `COMMAND` types
   - Create specialized interfaces for each type:
     - `ITextVariable` (string values)
     - `IDataVariable` (JSON-compatible values)
     - `IPathVariable` (path strings with validation)
     - `ICommandVariable` (command definitions)

3. **Metadata Tracking**
   - Define `VariableMetadata` interface with:
     - `source: SourceLocation` for tracking definition location
     - `createdAt: number` timestamp
     - `updatedAt: number` timestamp
     - `history?: VariableChange[]` for tracking changes

4. **Data Variable Structure**
   - Define `DataValue` type as union of JSON-compatible values:
     - `null | boolean | number | string | DataObject | DataArray`
   - Define `DataObject` as `Record<string, DataValue>`
   - Define `DataArray` as `DataValue[]`

## Variable Storage & Access

5. **State Storage Interface**
   - Define `IVariableStorage` interface with:
     - Type-specific maps: `textVars`, `dataVars`, `pathVars`, `commands`
     - Generic `getVariable<T>(type, name)` method
     - Type-specific getters (e.g., `getTextVar`, `getDataVar`)
     - Type-safe setters that enforce value types

6. **Variable Resolution Context**
   - Define `ResolutionContext` interface with:
     - `state: IStateService` for accessing variables
     - `strict: boolean` to control error behavior
     - `depth: number` to prevent infinite recursion
     - `allowedVariableTypes?: VariableType[]` to restrict resolution
     - `isVariableEmbed?: boolean` to modify resolution behavior
     - `formattingContext?: FormattingContext` for output formatting

## Variable References & Field Access

7. **Variable Reference Structure**
   - Define `IVariableReference` interface with:
     - `type: 'variable-reference'` for type discrimination
     - `identifier: string` for variable name
     - `fields?: FieldAccess[]` for field access
     - `fallback?: string` for default value

8. **Field Access Types**
   - Define `FieldAccess` interface with:
     - `type: 'property' | 'index'` for access type
     - `value: string | number` for property name or index
   - Implement type-safe field accessor utilities

## Command Definitions

9. **Command Structure**
   - Define `ICommand` interface with:
     - `name: string` for command identifier
     - `parameters: ICommandParameter[]` for parameter definitions
     - `implementation: CommandFunction` for execution
     - `description?: string` for documentation

10. **Command Parameters**
    - Define `ICommandParameter` interface with:
      - `name: string` for parameter name
      - `type: ParameterType` for parameter type
      - `defaultValue?: any` for optional default
      - `description?: string` for documentation

## Resolution & Validation

11. **Resolution System**
    - Implement nested variable resolution with depth tracking
    - Support different resolution behaviors based on context
    - Handle field access for data variables with proper validation
    - Implement circular reference detection

12. **Validation Rules**
    - Validate variable existence before access
    - Verify field access operations are valid for variable type
    - Check array bounds when accessing array elements
    - Validate state transitions maintain variable integrity

13. **Error Handling**
    - Provide structured error information with variable name and field path
    - Support different error behaviors based on strict mode
    - Implement fallback mechanisms for missing variables

## Type Conversion & Formatting

14. **Formatting Context**
    - Support block vs. inline formatting based on context
    - Implement pretty-printed JSON for block context
    - Use compact representation for inline context

15. **Type Guards & Safety**
    - Implement type guard functions (e.g., `isTextVariable`, `isDataVariable`)
    - Use branded types for variable names and state IDs
    - Ensure exhaustive type checking in switch statements

## Implementation Approach

16. **Migration Strategy**
    - Support backward compatibility with existing code
    - Allow progressive adoption of new type system
    - Provide adapter functions for legacy code integration

17. **Developer Experience**
    - Design types to provide helpful IDE hints
    - Include comprehensive JSDoc comments
    - Create builder patterns for complex objects

## Key Design Decisions

1. **Discriminated Unions**: Using TypeScript's discriminated unions with the `type` property provides strong type safety and enables exhaustive checking.

2. **Context-Based Resolution**: The `ResolutionContext` approach provides flexibility while maintaining type safety, allowing different resolution behaviors based on execution context.

3. **Metadata Tracking**: Including optional metadata enables debugging and history tracking without impacting performance in production.

4. **Validation Strategy**: Combining static (compile-time) and runtime validation ensures maximum safety while maintaining flexibility.

5. **Format Context Separation**: Separating formatting concerns from core variable structure improves separation of concerns and maintainability.

## Implementation Priorities

1. **Base Type Structure**: Implement core variable interfaces and type discrimination first.
2. **Storage & Access**: Implement type-safe storage and access methods next.
3. **Resolution Context**: Build the resolution context system to support different behaviors.
4. **Field Access**: Implement robust field access with proper validation.
5. **Error Handling**: Develop comprehensive error handling with appropriate context.

This consolidated approach balances type safety, flexibility, and backward compatibility while providing a solid foundation for Meld's variable handling system.