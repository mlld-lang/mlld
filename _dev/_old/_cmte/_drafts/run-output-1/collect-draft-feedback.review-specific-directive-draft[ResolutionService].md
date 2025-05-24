# Feedback on Run Draft Specification (from ResolutionService)

## 1. Accuracy Assessment

The draft specification generally aligns with the ResolutionService needs, particularly regarding variable handling and path resolution. The types are structured to accommodate the variable interpolation and path expansion that our service handles. The inclusion of properties like `command`, `args`, `cwd`, `workingDir`, and `env` provides the necessary fields that would require resolution by our service.

## 2. Completeness Assessment

* **Missing Resolution Context**: The specification doesn't explicitly address how variable references within command strings, arguments, and environment variables should be resolved. Our ResolutionService would benefit from clarity on which fields should undergo variable interpolation.

* **Path Resolution Specification**: While `cwd` and `workingDir` are included, there's no explicit indication of how path expansion should be handled. Our PathResolver would need clear guidance on which properties should undergo path normalization.

* **Data Source Indication**: For variable references, there's no indication of what data sources should be considered during resolution (e.g., environment variables, state variables, etc.).

## 3. Clarity & Usability Assessment

* The type definitions are generally clear and well-structured. The discriminated union pattern is appropriate for the different run directive variants.

* The TSDoc comments are helpful but could benefit from examples of variable reference syntax that our service would need to process.

* Suggested Clarification: Add explicit documentation about which fields will undergo variable interpolation and path expansion by the ResolutionService.

## 4. Potential Issues / Edge Cases

* **Circular References**: The specification doesn't address how to handle potential circular references in variable interpolation, which could cause infinite recursion in our resolvers.

* **Complex Nested Variables**: No guidance on handling deeply nested variable references (e.g., `${var.${nestedVar}}`) which our VariableReferenceResolver would need to process.

* **Command String Complexity**: For complex command strings with embedded variables, there's no clear specification on escaping rules or handling of special characters.

* **Path Normalization Across Platforms**: The specification doesn't address cross-platform path normalization requirements which our PathResolver handles.

## 5. Validation Concerns

* **Variable Reference Validation**: The specification should explicitly mention validation requirements for variable reference syntax that our service would enforce.

* **Path Validation**: Clear requirements for path validation (absolute vs. relative, security constraints) would help our PathResolver implementation.

* **Resolution Failure Handling**: The `errorHandling` property exists, but it's not clear how it applies specifically to resolution failures versus execution failures.

## 6. Specific Improvement Suggestions

* **Add Resolution Strategy Property**: Include a `resolutionStrategy` property that specifies how aggressively to resolve variables (e.g., 'strict' requiring all variables to exist, 'lenient' allowing undefined variables to remain as-is).

* **Variable Reference Format Specification**: Add documentation or a type that explicitly defines the expected format for variable references (e.g., `${varName}` or other syntax).

* **Resolution Order Clarification**: Specify the order in which nested variables should be resolved, which would guide our VariableReferenceResolver implementation.

* **Path Context Property**: Add a property that indicates the context for path resolution (e.g., 'project-relative', 'absolute', 'working-dir-relative') to guide our PathResolver.

* **Resolution Scope Limitation**: Consider adding a property that limits which variables can be referenced, for security and predictability (e.g., only allow referencing certain namespaces of variables).

* **Enhance Environment Variables**: The `env` property could benefit from a more structured type that indicates which environment variables should be interpolated from the current environment versus set explicitly.

These suggestions would make the specification more complete and precisely guide the implementation of the ResolutionService components that will handle variable interpolation and path expansion for the run directive.