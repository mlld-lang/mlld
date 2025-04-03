# Feedback on Run Directive Draft Specification (from DirectiveService)

## 1. Accuracy Assessment

The draft specification generally aligns well with the DirectiveService's needs. It correctly identifies the key properties needed for run directive handling, including command execution details, error handling, and output capture mechanisms. The discriminated union type approach using `commandType` and `captureOutput` as discriminators is appropriate for our handler structure.

However, there are some inconsistencies with our current implementation that should be addressed:

- The current implementation in RunDirectiveHandler uses a different approach to handling language-specific commands than what's represented in the draft.
- Some property names differ from what's currently used in our service implementation.

## 2. Completeness Assessment

Several important properties and types are missing from the draft:

- **Missing Property**: `input` - This is used in our current implementation to provide standard input to commands.
- **Missing Property**: `name` - Used in our current implementation for identifying defined commands.
- **Missing Type**: `RunSubtype` - Our current implementation classifies run directives into subtypes (basic, language, defined) which should be represented in the type system.
- **Missing Interface**: `CommandResult` - The return type of command execution is not defined.
- **Missing Property**: `async` - Used to determine if a command should be executed asynchronously.
- **Missing Property**: `silent` - Used to suppress output in our current implementation.

## 3. Clarity & Usability Assessment

The type names and structure are generally clear, but some improvements would help:

- The `MeldRunDirectiveLanguageParams` should extend `MeldRunDirectiveWithOutputParams` or `MeldRunDirectiveWithoutOutputParams` rather than the base params, as language commands can also capture output.
- Having both `cwd` and `workingDir` as aliases could cause confusion. We should standardize on one property name.
- Similarly, `memoize` and `once` should be consolidated to a single property name.
- TSDoc comments are generally good but should include examples for complex properties.

## 4. Potential Issues / Edge Cases

- **Handler Compatibility**: The current structure of our handlers (BasicCommandHandler, LanguageCommandHandler, DefinedCommandHandler) doesn't perfectly align with the type structure presented.
- **Error Handling Function**: The `ErrorHandlingStrategy` type includes a function type, but it's not clear how this would be serialized/deserialized when directives are passed between services.
- **String Language Type**: The `RunLanguage` type includes `string`, which makes type checking less useful. We should consider an enum or union of specific strings.
- **Command Type Discrimination**: The current design doesn't clearly handle the case where a directive could be both a language command and capture output.

## 5. Validation Concerns

- **Range Validation**: The specification marks `range` as required, but our current implementation can function without it. We should clarify if this is truly required.
- **Command Validation**: We need more specific validation rules for different command types. For example, language commands need different validation than basic commands.
- **Runtime vs Type Validation**: The specification doesn't clearly distinguish between compile-time type checking and runtime validation, which our service needs to implement.
- **Missing Validation**: There's no validation specified for `stateKey` format, which is critical for proper state management.

## 6. Specific Improvement Suggestions

1. **Restructure Command Types**: Revise the type hierarchy to better match our handler structure:
   ```typescript
   export type RunDirectiveSubtype = 'basic' | 'language' | 'defined';
   
   export interface BaseRunParams {
     // Common properties
     command: string;
     id: string;
     // etc.
   }
   
   export interface BasicRunParams extends BaseRunParams {
     subtype: 'basic';
   }
   
   export interface LanguageRunParams extends BaseRunParams {
     subtype: 'language';
     language: RunLanguage;
   }
   
   export interface DefinedRunParams extends BaseRunParams {
     subtype: 'defined';
     name: string;
   }
   ```

2. **Add Command Result Interface**:
   ```typescript
   export interface CommandResult {
     stdout: string;
     stderr: string;
     exitCode: number;
     success: boolean;
   }
   ```

3. **Standardize Property Names**:
   - Use `cwd` consistently (remove `workingDir`)
   - Use `memoize` consistently (remove `once`)

4. **Add Missing Properties**:
   ```typescript
   export interface BaseRunParams {
     // Existing properties...
     
     /**
      * Standard input to provide to the command
      */
     input?: string;
     
     /**
      * Whether to execute the command asynchronously
      */
     async?: boolean;
     
     /**
      * Whether to suppress command output
      */
     silent?: boolean;
   }
   ```

5. **Improve Language Type Safety**:
   ```typescript
   export type RunLanguage = 'javascript' | 'typescript' | 'python' | 'shell' | 'bash' | 'powershell';
   // Remove the generic 'string' option to improve type safety
   ```

6. **Add Examples to TSDoc**:
   ```typescript
   /**
    * Environment variables for command execution.
    * @example
    * env: { "NODE_ENV": "production", "DEBUG": "true" }
    * @validation Values must be strings or valid variable references.
    */
   env?: Record<string, string>;
   ```

These improvements would better align the specification with our current implementation while providing a clearer structure for future development.