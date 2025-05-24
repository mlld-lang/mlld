# Feedback on Run Draft Specification (from ResolutionService)

## 1. Accuracy Assessment

The draft specification captures most of the core requirements for the `run` directive from the ResolutionService perspective. The types and interfaces are generally appropriate for our service's needs. The directive structure aligns with our variable resolution capabilities and provides the necessary properties that would need interpolation.

## 2. Completeness Assessment

* **Missing Resolution Flags**: The specification lacks properties to control variable resolution behavior. We should add a property like `resolveVariables?: boolean` to indicate whether variable references in command, args, etc. should be resolved.

* **Missing Resolution Context**: There's no clear way to provide or reference a resolution context. Consider adding a `resolutionContext?: ResolutionContext` property or similar concept to control the scope of variable resolution.

* **Missing Nested Resolution Support**: The draft doesn't address how deeply nested objects (like in `env`) should be resolved. We need to clarify if resolution should be recursive for complex structures.

* **Missing Path Resolution Control**: Since our service handles path expansion, we should add a property like `resolvePaths?: boolean` to control whether paths in commands and arguments should be expanded.

## 3. Clarity & Usability Assessment

* The interface and enum names are clear and follow our naming conventions.

* TSDoc comments are helpful but could be expanded to clarify resolution behavior.

* Suggested Addition: Add more detailed JSDoc comments for properties that will undergo resolution processing, indicating how variable references will be handled.

* Suggested Clarification: The `stateKey` property documentation should mention that variable references within this key will be resolved before use.

## 4. Potential Issues / Edge Cases

* **Circular References**: The specification doesn't address how to handle circular references in variable resolution, which could cause infinite loops.

* **Resolution Order**: There's no clear indication of the order in which properties should be resolved. For example, should `cwd` be resolved before `command` or vice versa?

* **Error Propagation**: The specification doesn't detail how resolution errors should be propagated or handled within the run directive execution flow.

* **Partial Resolution**: No guidance on how to handle cases where some variables are resolvable but others are not within the same string.

## 5. Validation Concerns

* **Variable Reference Validation**: We need clearer validation rules for variable references syntax (e.g., `${var}` format).

* **Path Validation**: For properties that represent file paths (like `cwd`), validation should include checks for path validity after resolution.

* **Environment Variable Resolution**: The validation for `env` should specify how to handle resolution of variable references within environment variable values.

* **Command Resolution Safety**: We should add validation to prevent command injection vulnerabilities when resolving variables in commands.

## 6. Specific Improvement Suggestions

* **Add Resolution Control Properties**:
  ```typescript
  /**
   * Controls whether variable references should be resolved
   * Defaults to true
   */
  resolveVariables?: boolean;
  
  /**
   * Controls whether paths should be expanded
   * Defaults to true
   */
  resolvePaths?: boolean;
  ```

* **Add Resolution Context**:
  ```typescript
  /**
   * Context for variable resolution
   * If not provided, the global context will be used
   */
  resolutionContext?: string | ResolutionContext;
  ```

* **Enhance Error Handling**:
  ```typescript
  /**
   * How to handle variable resolution errors
   */
  resolutionErrorHandling?: 'error' | 'warn' | 'ignore' | 'substitute';
  
  /**
   * Value to use when variable resolution fails and resolutionErrorHandling is 'substitute'
   */
  resolutionErrorFallback?: string;
  ```

* **Add Resolution Phase Indicator**:
  ```typescript
  /**
   * Indicates whether this directive has completed variable resolution
   * Used internally by the pipeline
   */
  _resolved?: boolean;
  ```

* **Clarify Execution Result Handling**: Add documentation about how the `executionResult` property interacts with resolution, particularly for streaming or async execution modes.