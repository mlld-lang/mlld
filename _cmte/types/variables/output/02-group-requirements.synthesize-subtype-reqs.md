# Synthesized Requirements for Internal Variable Type Structures

## Core Variable Structure Requirements

1. **Base Variable Interface**
   - Define a common interface for all variable types with shared properties
   - Include metadata like source location, last modified timestamp
   - Include type discriminator for runtime type checking

2. **Strongly-Typed Variable Container**
   - Define a `VariableStore<T>` interface to replace direct Map usage
   - Include consistent methods: get, set, has, delete, forEach, entries, clone
   - Create specialized types: TextVariableStore, DataVariableStore, PathVariableStore, CommandVariableStore

3. **Variable Reference Structure**
   - Define a unified `VariableReference` interface with type discriminator
   - Include fields for name, type, and optional path for nested access
   - Support parsing from string formats ({{var}}, $var, etc.)

## Variable Value Type Requirements

4. **Text Variable Value Type**
   - Simple string type for text variables
   - Consistent string handling across the system

5. **Data Variable Value Types**
   - Define structured types: DataPrimitive, DataArray, DataObject, DataValue
   - Support JSON-compatible values (string, number, boolean, null, arrays, objects)
   - Include type guards for runtime type checking

6. **Path Variable Value Type**
   - String type representing filesystem paths
   - Potentially include validation for path format

7. **Command Definition Structure**
   - Define `CommandDefinition` interface with command string and options
   - Support for metadata (description, source file, definition location)
   - Type-safe options record with DataValue types

## Metadata and Context Requirements

8. **Source Location Tracking**
   - Define `SourceLocation` interface with file, line, column information
   - Attach to variables for error reporting and debugging

9. **Variable Field Access**
   - Define `VariableField` type for accessing nested properties
   - Support both string and number indices for array access
   - Include type information (identifier, number, string)

10. **State Update Context**
    - Track variable modifications with source, operation, timestamp
    - Include variable type and name in update context
    - Support different operation types (set, delete, merge, transform)

11. **Resolution Context Type**
    - Define context for variable resolution with configuration options
    - Include depth tracking, strictness mode, allowed variable types
    - Track visited variables to prevent infinite recursion

## Type Safety Improvements

12. **Discriminated Union for Variable Types**
    - Use TypeScript discriminated unions for type-safe handling
    - Enable exhaustive type checking in switch statements
    - Support pattern matching based on variable type

13. **Type Guards and Validation**
    - Include isDataObject, isDataArray, etc. type guards
    - Support runtime validation of variable values
    - Enable compile-time type narrowing

14. **Type-Safe Variable Operations**
    - Define interfaces for type-safe get/set operations
    - Ensure operations maintain type consistency
    - Prevent accidental type conversions

15. **Immutability Controls**
    - Support for marking variables as immutable
    - Type-safe immutability guarantees
    - Clear immutability semantics in interfaces