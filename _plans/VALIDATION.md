# Validation Architecture Plan

## Background

The Meld codebase has undergone significant architectural changes, particularly in how we handle variables and AST processing. Originally, much of our validation was done through string parsing and regular expressions, spread across different layers of the application. This led to redundant validation, unclear responsibilities, and potential inconsistencies.

A major shift came with the AST refactoring (see _plans/AST-VARIABLES-done.md), where we moved to a more structured approach. The grammar now produces rich AST nodes that contain all necessary information about variables, paths, and other elements. This eliminated the need for downstream services to re-parse strings or perform their own syntax validation.

However, our validation code hasn't fully caught up with this architectural shift. Many validators still contain string parsing logic that duplicates what the grammar already does. For example, the embed directive validator still uses regex to find variables in templates, even though those variables are already available as AST nodes.

This plan outlines how to align our validation architecture with the new AST-centric approach, ensuring each layer (Grammar, Validator, Handler) has clear responsibilities and avoiding redundant work.

## Current Understanding

### Three Layers of Validation

1. **Grammar Validation (AST Layer)**
   - Handles syntax and structure validation
   - Creates typed AST nodes with proper structure
   - Example: For `@embed [[template]]`, validates:
     - Basic directive syntax
     - Template content format
     - Variable reference syntax
     - Path formats

2. **Validator Logic (Semantic Layer - within existing services)**
   - Validates AST node structure and relationships (semantic checks)
   - Does NOT re-parse strings or re-validate syntax
   - Focuses on validating AST node properties and integrity rules (e.g., variable immutability for `@define`)
   - Example: For `@embed`:
     - Validates that path exists *in AST* for embedPath
     - Validates that variable reference exists *in AST* for embedVariable
     - Validates that content exists for embedTemplate
   - Errors raised should use appropriate `ErrorSeverity` (Fatal, Recoverable, Warning) based on `docs/dev/ERROR-HANDLING.md`.

3. **Handler Service (Runtime Layer)**
   - Handles runtime validation and execution
   - Validates actual resources and state
   - Example: For `@embed`:
     - Validates file existence for embedPath
     - Validates variable existence for embedVariable
     - Validates variable resolution for embedTemplate

## Current Issues

1. **Redundant Validation**
   - Validators sometimes re-parse strings that grammar already parsed
   - Example: Using regex to find variables in template when AST already has them

2. **Mixed Concerns**
   - Some validators try to do runtime validation
   - Some handlers repeat AST validation

3. **Inconsistent Approach**
   - Different directives handle validation differently
   - Some rely more on grammar, others on validators

## Required Changes

### 1. Update Validator Service

```typescript
// Example of proper validator approach (within a service)
export function validateEmbedDirective(node: DirectiveNode): void {
  const directive = node.directive as EmbedDirectiveData;
  
  switch (directive.subtype) {
    case 'embedPath':
      // Only validate AST structure
      if (!directive.path) {
        // Assign appropriate severity (e.g., Fatal for missing core structure)
        throw new MeldDirectiveError('Missing path in AST', { severity: ErrorSeverity.Fatal });
      }
      break;
      
    case 'embedVariable':
      // Only validate AST structure
      if (!directive.path?.variable) {
        throw new MeldDirectiveError('Missing variable reference in AST', { severity: ErrorSeverity.Fatal });
      }
      break;
      
    // Example for a hypothetical '@define' validator:
    // case 'defineVariable': 
    //   if (variableAlreadyExists(directive.variableName)) {
    //     // Recoverable, as maybe user wants to allow overrides later?
    //     throw new MeldDirectiveError(`Variable '${directive.variableName}' already defined`, { severity: ErrorSeverity.Recoverable });
    //   }
    //   break;
      
    case 'embedTemplate':
      // Only validate AST structure
      if (!directive.content) {
        throw new MeldDirectiveError('Missing content in AST', { severity: ErrorSeverity.Fatal });
      }
      break;
  }
}
```

### 2. Update Handlers

```typescript
// Example of proper handler approach
async handle(context: DirectiveProcessingContext): Promise<DirectiveResult> {
  // Trust that AST is valid
  const directive = context.node.directive as EmbedDirectiveData;
  
  switch (directive.subtype) {
    case 'embedPath':
      // Focus on runtime validation
      if (!await this.fileSystem.exists(directive.path)) {
        throw new MeldDirectiveError('File does not exist');
      }
      break;
  }
}
```

### 3. Document Grammar Responsibilities

- Update grammar documentation to clearly state what it validates
- Add comments in grammar rules explaining validation
- Consider adding validation-specific grammar tests

## Action Items

1. **Audit Current Validators**
   - [ ] List all string parsing in validators
   - [ ] Identify anything else that needs to move to grammar
   - [ ] Document AST shape requirements

2. **Update Grammar**
   - [ ] Rely on string parsing in grammar where possible
   - [ ] Ensure AST nodes contain all needed data
   - [ ] Add validation-focused tests

3. **Refactor Validators**
   - [x] Remove string parsing (`@embed` - confirmed none)
   - [x] Focus on AST structure and semantic integrity (`@embed` - confirmed)
   - [x] Remove string parsing (`@define` - done)
   - [x] Focus on AST structure and semantic integrity (`@define` - done)
   - [ ] Add checks for variable immutability where appropriate (e.g., `@define` - deferred to handler/state)
   - [x] Add clear error messages (`@embed` - confirmed)
   - [x] Ensure correct `ErrorSeverity` is assigned to errors (`@embed` - confirmed)

4. **Update Handlers**
   - [x] Remove AST validation (`@embed` - done)
   - [x] Focus on runtime checks (`@embed` - confirmed)
   - [x] Add clear error messages (`@embed` - confirmed)

## Plan: Directive Handler Audits

After refactoring validators, audit the corresponding handlers to remove redundant checks:

- [x] `@define`: DefineDirectiveHandler (removed checks relying on validator guarantees)
- [x] `@run`: RunDirectiveHandler
- [x] `@data`: DataDirectiveHandler
- [x] `@path`: PathDirectiveHandler
- [x] `@import`: ImportDirectiveHandler

## Implications

### 1. Performance
- Reduced redundant processing - no more re-parsing of strings
- Better error detection - issues caught at the right layer
- More efficient variable resolution - direct AST access vs string parsing

### 2. Maintainability
- Clear separation of concerns makes code easier to understand
- Validation bugs are easier to fix when we know which layer is responsible
- New directives have a clear template to follow

### 3. User Experience
- More accurate error messages - reported from the correct layer
- Better error locations - grammar catches syntax errors at exact position
- Faster processing - no redundant validation

### 4. Developer Experience
- Easier to add new directives - clear validation pattern
- Simpler testing - each layer has clear responsibilities
- Better IDE support - TypeScript can better understand AST types

## Migration Strategy

1. Start with one directive (e.g., `@embed`)
2. Update its grammar, validator, and handler
3. Use as example for other directives
4. Create validation checklist for new directives

## Success Metrics

1. No string parsing in validators
2. Clear separation of concerns
3. Consistent approach across directives
4. Better error messages
5. Fewer redundant checks

## Phase 1: Audit and Refactor Validators/Handlers
 
 Goal: Ensure validators only check structure/types guaranteed by the grammar/AST, and handlers remove redundant checks.
 
 **Remaining directives for Phase 1 audit: *None***
 
  - [x] `@define`
    - [x] `DefineDirectiveValidator`: Audit complete. Relies on grammar structure.
    - [x] `DefineDirectiveHandler`: Audit complete. Removed redundant checks.
  - [x] `@embed`
    - [x] `EmbedDirectiveValidator`: Audit complete. Relies on grammar structure.
    - [x] `EmbedDirectiveHandler`: Audit complete. Removed redundant checks.
  - [x] `@run`
    - [x] `RunDirectiveValidator`: Audit complete. Will rely on grammar structure when phase 2 is completed.
    - [x] `RunDirectiveHandler`: Audit complete. Removed redundant checks. 
  - [x] `@data`
    - [x] `DataDirectiveValidator`: Audit complete. Removed potentially incorrect JSON.parse check for string literals.
    - [x] `DataDirectiveHandler`: Audit complete for 'literal' and 'reference' sources. TODOs remain for 'embed', 'run', and schema validation.
  - [x] `@path`
    - [x] `PathDirectiveValidator`: Audit complete. Removed outdated fallbacks ('id', 'value', string path) and aligned with expected AST structure.
    - [x] `PathDirectiveHandler`: Audit complete. Removed redundant checks now covered by the validator.
  - [x] `@import`
    - [x] `ImportDirectiveValidator`: Audit complete. No changes needed. Path checks are sufficient as handler delegates resolution complexity.
    - [x] `ImportDirectiveHandler`: Audit complete. No changes needed.

## Phase 2: Grammar Enhancement for `@run $cmd(...)` Arguments

**Context & Problem:**

During the audit of `RunDirectiveHandler`, a type mismatch issue was identified when resolving arguments for the `@run $commandName(arg1, arg2, ...)` syntax (subtype `runDefined`). The `args` property in the AST for this directive is currently an array of `InterpolatableValue` nodes.

`InterpolatableValue` can represent not only `TextNode` (from string literals) and `VariableReferenceNode` (from `{{var}}`) but also **direct JSON object and array literals** (parsed via `JsonObject` and `JsonArray` rules in the grammar, resulting in plain JS objects/arrays in the AST's value property).

The `ResolutionService` methods (`resolveNodes`, `resolveInContext`) are designed to resolve `InterpolatableValue[]` into a single concatenated string, or handle specific types like `StructuredPath`. They are **not** currently designed to resolve each element of an `InterpolatableValue[]` (which might include raw objects/arrays) into individual strings suitable for a `string[]` command argument list.

Attempts to loop through the `args` array in `RunDirectiveHandler` and resolve each `argNode` individually using `resolveNodes([argNode], ...)` failed because `resolveNodes` (and `resolveInContext`) have internal expectations or type constraints that are violated when `argNode` represents a direct object/array literal rather than a `TextNode` or `VariableReferenceNode`.

**Proposed Solution: Grammar Restriction**

Modify the grammar (`core/ast/grammar/meld.pegjs`) to restrict the types allowed for individual arguments within the `@run $commandName(...)` syntax.

1.  **Identify Argument Rule:** Locate the rule parsing the comma-separated argument list for `runDefined` directives.
2.  **Identify Item Rule:** Find the rule parsing a single item within that list.
3.  **Restrict Item Rule:** Modify this rule to **disallow** direct JSON object literals (`{ ... }`) and array literals (`[ ... ]`). The rule should primarily permit:
    *   Variable References (`{{ variable }}`) -> `VariableReferenceNode`
    *   Quoted String Literals (`"string"`) -> results in `TextNode` structure
    *   (Potentially) Other simple literals (numbers, booleans, null) if they are intended to be consistently stringified by the resolver.

**User Impact:**

*   Users needing to pass complex data (objects/arrays) as arguments to a defined command **must** use variables:
    ```meld
    @data config = { "key": "value" }
    @run $myCommand({{config}})
    ```
*   Attempting to use direct object/array literals as arguments will result in a **parse-time syntax error**:
    ```meld
    @run $myCommand({ "key": "value" }) // INVALID - Syntax Error
    @run $myCommand([1, 2])           // INVALID - Syntax Error
    ```

**Codebase Implications & Implementation Steps:**

1.  **Grammar (`core/ast/grammar/meld.pegjs`):** Modify the relevant argument parsing rule(s) as described above.
2.  **AST Structure:** The `args` array generated for `@run $cmd(...)` directives will now be guaranteed to contain only nodes representing simple, string-resolveable types (e.g., `VariableReferenceNode`, `TextNode`).
3.  **`RunDirectiveValidator.ts`:** No changes required.
4.  **`RunDirectiveHandler.ts`:**
    *   After the grammar change is implemented and the AST guarantees the simpler structure for `args`, the TypeScript errors previously encountered (`5bb2d898`/`6c1bb4f4`) should be resolvable.
    *   The logic for resolving `runDefined` arguments needs to be finalized. It should now be safe to loop through `definedCommand.args` and resolve each `argNode` using `resolveNodes([argNode], context)` (or potentially `resolveInContext` if the argument itself could be a *path* variable reference, although `resolveNodes` is likely sufficient and simpler now).
    ```typescript
    // Example of corrected logic in RunDirectiveHandler after grammar change:
    if (definedCommand.args) {
        const resolvedArgsPromises = definedCommand.args.map(
            argNode => this.resolutionService.resolveNodes([argNode], resolutionContext) // Should now work!
        );
        commandArgs = await Promise.all(resolvedArgsPromises);
    }
    ```
5.  **`ResolutionService.ts`:** No changes required. The previously considered `resolveNodesToArray` method is **not needed** if the grammar enforces simpler argument types.

## Phase N: Future Enhancements
