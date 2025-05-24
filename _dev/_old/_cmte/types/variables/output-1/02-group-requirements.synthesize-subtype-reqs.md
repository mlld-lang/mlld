# Synthesized Requirements for Internal Variable Type Structures

## Core Variable Structure Requirements

1. **Define a Generic `TypedVariable<T>` Interface**
   - Include `type: VariableType` for type discrimination
   - Include `value: T` for strongly-typed values
   - Include optional `metadata?: VariableMetadata` for tracking history

2. **Define `VariableType` Enum or Union Type**
   - Include `'text'`, `'data'`, `'path'`, and `'command'` types
   - Use as discriminant property for type narrowing

3. **Define `VariableMetadata` Interface**
   - Include `source?: string` for tracking where variable was defined
   - Include `createdAt: number` timestamp
   - Include `updatedAt: number` timestamp
   - Include optional `transformations?: string[]` for tracking changes

4. **Define Specific Variable Type Interfaces**
   - `TextVariable extends TypedVariable<string>`
   - `DataVariable extends TypedVariable<VariableValue>` (JSON-compatible values)
   - `PathVariable extends TypedVariable<string>`
   - `CommandDefinition extends TypedVariable<CommandDefinitionValue>`

5. **Define `VariableValue` Type for Data Variables**
   - Use union type: `string | number | boolean | null | VariableObject | VariableArray`
   - Define `VariableObject` as `{ [key: string]: VariableValue }`
   - Define `VariableArray` as `VariableValue[]`

## Variable Storage Requirements

6. **Define `VariableStorage` Interface**
   - Include `text: Map<string, TypedVariable<string>>`
   - Include `data: Map<string, TypedVariable<VariableValue>>`
   - Include `path: Map<string, TypedVariable<string>>`
   - Include `command: Map<string, TypedVariable<CommandDefinition>>`

7. **Define Type-Safe Accessor Methods**
   - Generic `getVar<T>(type: VariableType, name: string): T | undefined`
   - Type-specific getters that return appropriate types
   - Type-safe setters that enforce value types

## Variable Reference Requirements

8. **Define `VariableReference<T>` Interface**
   - Include `type: VariableType` for type discrimination
   - Include `name: string` for variable name
   - Include optional `path?: string[]` for field access
   - Include optional `defaultValue?: T` for fallback

9. **Define Field Access Types**
   - Define `Field` interface with `type: 'field' | 'index'` and `value: string | number`
   - Define `FieldPath` as `Array<Field>`
   - Include type-safe field accessor utilities

## Command Definition Requirements

10. **Define `CommandDefinition` Interface**
    - Include `name: string` for command name
    - Include `parameters: CommandParameter[]` for parameter definitions
    - Include `body: string | CommandStep[]` for command implementation
    - Include optional `description?: string` for documentation

11. **Define `CommandParameter` Interface**
    - Include `name: string` for parameter name
    - Include `type: VariableType` for parameter type
    - Include optional `defaultValue?: any` for default value
    - Include optional `description?: string` for documentation

## Type Safety Improvements

12. **Use Discriminated Unions for Type Safety**
    - Leverage TypeScript's discriminated unions with the `type` property
    - Include exhaustiveness checking in switch statements

13. **Add Type Guard Functions**
    - Include `isTextVariable(var: TypedVariable<any>): var is TypedVariable<string>`
    - Include `isDataVariable(var: TypedVariable<any>): var is TypedVariable<VariableValue>`
    - Include similar guards for other variable types

14. **Include Branded Types for Additional Safety**
    - Consider using branded types for variable names to prevent confusion
    - Use branded types for state IDs to ensure proper initialization

## Implementation Considerations

15. **Support Gradual Migration**
    - Ensure backward compatibility with existing code
    - Allow for progressive adoption of the new type system

16. **Optimize for Developer Experience**
    - Design types to provide helpful IDE hints and autocompletion
    - Include JSDoc comments for better documentation