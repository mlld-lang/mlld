Generate a detailed TypeScript type specification for how variables are defined, stored, resolved, and manipulated within the Meld system. 

**Context:**

*   **Architecture & Pipeline:** Review the overall system design described in `{{ architectureContext }}` and the processing flow in `{{ pipelineContext }}`.
*   **Core Services:**
    *   `StateService`: Analyze `{{ stateServiceCode }}` and `{{ stateTypesCode }}` for variable storage (`textVars`, `dataVars`, `pathVars`, `commands`), scoping, and transformation.
    *   `ResolutionService`: Examine `{{ resolutionServiceCode }}` for general variable reference resolution (`{{var}}`, `{{data.field}}`, `$PATHVAR/sub`).
*   **Path & Filesystem Services:**
    *   `PathService`: Analyze `{{ pathServiceCode }}` for how *filesystem* path variables are validated (security, normalization) and potentially how it coordinates with URL resolution.
    *   `FileSystemService`: Review `{{ fileSystemServiceCode }}` for its role in filesystem path checks.
    *   `PathOperationsService`: Consider `{{ pathOpsServiceCode }}` for path utility functions.
*   **URL Handling:**
    *   `URLContentResolver`: **Critically, analyze `{{ urlContentResolverCode }}` as the primary service for URL handling.** Detail how it validates URLs (`validateURL`), fetches content (`fetchURL` including caching), checks `isURL`, and manages security policies.
    *   Note the specific URL error types defined in `{{ urlErrorsCode }}`.
    *   Review the integration plans in `{{ urlPlanContext }}` and the overview in `{{ urlHandlingContext }}` to understand how directives will use this service.
*   **Directive Definitions:** Refer to `{{ directiveTypesCode }}` for directive structures.

**Requirements for the Type Specification:**

1.  **Variable Categories:** Define distinct types/interfaces for Text, Data, Path, and Command variables.
2.  **Storage Representation:** Model internal storage (maps, nested structures).
3.  **Path/URL Variable Specifics:**
    *   Clearly represent properties for *filesystem* paths (resolved path, validation status).
    *   **Explicitly incorporate the URL handling capabilities from `URLContentResolver` (`{{ urlContentResolverCode }}`).** Model how a variable can represent *either* a filesystem path *or* a URL. For URLs, include associated metadata derived from `URLContentResolver`'s operations (e.g., validation status, security checks passed, caching status, fetched content status/metadata if applicable).
4.  **Resolution Context:** Describe the necessary context for resolving variables, considering dependencies of `ResolutionService` and `URLContentResolver`.
5.  **Metadata:** Include source location and transformation status.
6.  **Error Handling:** Reference or incorporate relevant error types, **especially the URL errors from `{{ urlErrorsCode }}`** related to validation, security, and fetching.

**Output Format:**

Provide the output as a single TypeScript code block (`.ts`). Use interfaces and types. Add JSDoc comments. 