# Synthesized Requirements: @run Subtypes & Parameters

## Core Structure Requirements

1. **Use discriminated union pattern** for run directive subtypes with a `type` field as the discriminator:
   ```typescript
   type RunDirectiveSubtype = 
     | { type: 'basicCommand'; /* fields */ }
     | { type: 'languageCommand'; /* fields */ }
     | { type: 'definedCommand'; /* fields */ };
   ```

2. **Integrate with DirectiveData interface**:
   ```typescript
   interface RunDirectiveData extends DirectiveData {
     kind: 'run';
     subtype: RunDirectiveSubtype;
   }
   ```

## Basic Command Subtype

3. **Define BasicCommandDirective interface**:
   ```typescript
   interface BasicCommandDirective {
     type: 'basicCommand';
     command: string;
     isMultiLine?: boolean;
     output?: string;
   }
   ```

## Language Command Subtype

4. **Define LanguageCommandDirective interface**:
   ```typescript
   interface LanguageCommandDirective {
     type: 'languageCommand';
     language: string;
     command: string;
     parameters: ParameterValue[];
     output?: string;
   }
   ```

## Defined Command Subtype

5. **Define DefinedCommandDirective interface**:
   ```typescript
   interface DefinedCommandDirective {
     type: 'definedCommand';
     commandName: string;
     arguments: CommandArg[];
     output?: string;
   }
   ```

6. **Define CommandDefinition interface** for storing command templates:
   ```typescript
   interface CommandDefinition {
     name: string;
     command: string;
     parameters: string[] | CommandParameter[];
     description?: string;
     isMultiLine?: boolean;
   }
   ```

## Parameter Types

7. **Create unified parameter type system** for all parameter values:
   ```typescript
   type ParameterValue = 
     | StringParameter
     | NumberParameter
     | BooleanParameter
     | VariableReferenceParameter
     | ObjectParameter;
   ```

8. **Define base parameter interface**:
   ```typescript
   interface BaseParameter {
     position: number;
   }
   ```

9. **Define primitive parameter types**:
   ```typescript
   interface StringParameter extends BaseParameter {
     type: 'string';
     value: string;
   }

   interface NumberParameter extends BaseParameter {
     type: 'number';
     value: number;
   }

   interface BooleanParameter extends BaseParameter {
     type: 'boolean';
     value: boolean;
   }
   ```

10. **Define variable reference parameter type**:
    ```typescript
    interface VariableReferenceParameter extends BaseParameter {
      type: 'variable';
      valueType: 'text' | 'data' | 'path';
      identifier: string;
      fields?: FieldAccess[];
    }

    interface FieldAccess {
      type: 'field' | 'index';
      value: string | number;
    }
    ```

11. **Define object parameter type**:
    ```typescript
    interface ObjectParameter extends BaseParameter {
      type: 'object';
      value: Record<string, unknown>;
    }
    ```

## Command Arguments

12. **Define CommandArg interface** for defined commands:
    ```typescript
    type CommandArg = {
      type: 'string' | 'number' | 'boolean' | 'variable' | 'raw';
      value: string | number | boolean | null;
      position?: number;
    };
    ```

## Result Types

13. **Define CommandExecutionResult interface**:
    ```typescript
    interface CommandExecutionResult {
      stdout: string;
      stderr: string;
      exitCode: number;
      executionTime: number;
      command: string;
    }
    ```

14. **Extend DirectiveResult to support typed results**:
    ```typescript
    interface DirectiveResult<T = any> {
      replacementNode?: MeldNode;
      result?: T;
    }
    ```

## Parameter Resolution

15. **Define ResolvedParameter interface** for tracking parameter resolution:
    ```typescript
    interface ResolvedParameter {
      value: string;
      originalType: 'string' | 'number' | 'boolean' | 'object' | 'variable';
      variableType?: 'text' | 'data' | 'path';
      variableName?: string;
    }
    ```

## Command Reference Handling

16. **Define CommandReference type** for handling different command reference formats:
    ```typescript
    type CommandReference = AstCommandReference | StringCommandReference;

    interface AstCommandReference {
      type: 'ast';
      name: string;
      args: CommandArg[];
      raw?: string;
    }

    interface StringCommandReference {
      type: 'string';
      raw: string;
      name: string;
      argsString: string;
    }
    ```

## Notes on Conflicts and Considerations

1. There are slight variations in how parameters are represented across different feedback sources:
   - Some suggest position as a number field
   - Others suggest using a discriminated union with type field
   - Resolution: Use the discriminated union approach with a type field and include position information

2. Different approaches for command definition storage:
   - Some suggest simple string arrays for parameters
   - Others suggest structured CommandParameter objects
   - Resolution: Support both formats with a union type for backward compatibility

3. Variable references have different suggested structures:
   - Some use a fields array for nested access
   - Others use a path string array
   - Resolution: Use the more flexible fields array approach with type information

4. The parameter resolution process needs standardization:
   - Create a consistent approach to parameter resolution across all subtypes
   - Ensure type information is preserved throughout the resolution process