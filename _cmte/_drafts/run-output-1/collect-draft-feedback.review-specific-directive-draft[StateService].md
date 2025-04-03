# Feedback on `run` Draft Specification (from StateService)

## 1. Accuracy Assessment

Overall, the draft specification aligns well with the StateService's needs. The inclusion of `id`, `stateKey`, and `outputVariable` properties are particularly relevant for our service since we need to store and track execution results. The type definitions provide a good foundation for the StateService to manage state related to run directives.

## 2. Completeness Assessment

* **Missing Property**: `stateKeyPrefix` - The StateService could benefit from a property that allows prefixing state keys for organizational purposes. This would help when multiple run directives need to store related data under a common namespace.

* **Missing Property**: `stateScope` - Currently there's no way to specify whether the state should be persisted globally, per document, or per session. This is important for the StateService to determine the scope of variable storage.

* **Missing Property**: `dependsOn` - A property that allows specifying dependencies on other run directives (by their IDs). This would enable the StateService to track execution dependencies and handle re-execution when dependencies change.

* **Missing Type**: `StateUpdateStrategy` - We need a type to define how state updates should be handled (e.g., 'replace', 'merge', 'append'). This is especially important for handling sequential runs that update the same state key.

## 3. Clarity & Usability Assessment

The naming conventions and TSDoc comments are generally clear and well-structured. However:

* Suggested Renaming: `outputVariable` -> `outputStateKey` - This better aligns with our service's terminology and makes it clearer that this is where the output will be stored in state.

* Suggested Renaming: `errorOutputVariable` -> `errorStateKey` - For consistency with the above.

* The TSDoc for `stateKey` should clarify that this is used for storing the entire run result, while `outputVariable`/`outputStateKey` is specifically for the command output.

## 4. Potential Issues / Edge Cases

* **Issue 1**: There's no mechanism specified for handling state conflicts when multiple run directives try to update the same state key concurrently.

* **Issue 2**: The specification doesn't address how to handle large outputs that might impact state storage performance. The StateService may need size limits or streaming capabilities.

* **Issue 3**: No clear strategy for state cleanup for temporary run results that don't need to be persisted long-term.

* **Issue 4**: The relationship between `memoize`/`once` and state persistence isn't explicitly defined. The StateService needs to know whether to persist memoized results across sessions.

## 5. Validation Concerns

* **Concern 1**: The validation for `stateKey` mentions "must follow state key naming conventions," but these conventions aren't defined in the spec. The StateService has specific requirements for valid state keys.

* **Concern 2**: There's no validation rule for preventing circular dependencies if we add the suggested `dependsOn` property.

* **Concern 3**: Runtime validation will be needed to ensure that state keys don't conflict with reserved system state keys used by the StateService.

## 6. Specific Improvement Suggestions

* **Suggestion 1**: Add a `stateLifetime` property that specifies how long results should be retained in state (e.g., 'session', 'document', 'permanent').

* **Suggestion 2**: Extend the `stateKey` property to support a structured path notation (e.g., 'category.subcategory.name') that the StateService can use for hierarchical state organization.

* **Suggestion 3**: Add a `transformOutput` property that allows specifying a simple transformation function or path to extract specific data from the command output before storing it in state.

* **Suggestion 4**: Include a `mergeStrategy` property to define how new run results should be merged with existing state when updating the same key (especially useful for incremental builds or appending to logs).

* **Suggestion 5**: Consider adding a `retainOnError` flag to indicate whether failed run results should still update state, which would give more control over error handling within the StateService.