Below are three core problems all clearly reflected in the failing tests, together with the minimal, precise fixes needed. Each one is based directly on the error messages and code snippets appearing in your test run.

────────────────────────────────────────────────────────────────────────
1) “Cannot read properties of undefined (reading 'enableTransformation')”
────────────────────────────────────────────────────────────────────────

• Symptom in Tests:
  Hundreds of failures (e.g. “Directive error (text): Cannot read properties of undefined (reading 'enableTransformation')” in numerous integration/unit tests).  
• Root Cause:
  In code snippets such as RunDirectiveHandler and InterpreterService, the handler references “state.isTransformationEnabled()” or “opts.initialState.isTransformationEnabled()” while never defining “state” or “opts.” In reality, the relevant objects are named “context.state” and “options” in those methods.  
• Exact Code Fixes:

(a) RunDirectiveHandler.ts (or equivalent file in your codebase):
Replace the incorrect reference to “state” with “context.state”.  
Example:
--------------------------------------------------------------------------------
- if (state.isTransformationEnabled()) {
+ if (context.state.isTransformationEnabled()) {
--------------------------------------------------------------------------------

(b) InterpreterService.ts (or equivalent):
Replace “opts” with “options” so that “initialState” is accessed correctly.  
Example:
--------------------------------------------------------------------------------
- if (opts.initialState?.isTransformationEnabled()) {
+ if (options?.initialState?.isTransformationEnabled()) {
--------------------------------------------------------------------------------

Make these two fixes wherever the old variable names “state” or “opts” are used but only “context.state” or “options” exist. This resolves the undefined “enableTransformation” property references.

────────────────────────────────────────────────────────────────────────
2) DefineDirectiveHandler “expected undefined to be defined” for error.details?.location
────────────────────────────────────────────────────────────────────────

• Symptom in Tests:
  One of the failures in DefineDirectiveHandler.test.ts: “should handle state errors” → “expected undefined to be defined”.  
• Root Cause:
  The test expects “error.details.location” to exist when the directive throws, but the thrown DirectiveError does not populate .details.location.  
• Exact Code Fix:

In DefineDirectiveHandler (where the code creates a DirectiveError), add the location to the error’s details object. For example:
--------------------------------------------------------------------------------
// Inside your catch block or wherever you throw the error:
- throw new DirectiveError(`Directive error (define): ${err.message}`);
+ throw new DirectiveError(`Directive error (define): ${err.message}`, {
+   location: node.location,
+   details: { location: node.location },
+   cause: err
+ });
--------------------------------------------------------------------------------

This ensures “error.details?.location” is defined, matching what the test explicitly checks.

────────────────────────────────────────────────────────────────────────
3) Import Directive Tests failing with “Import file not found” due to path rules
────────────────────────────────────────────────────────────────────────

• Symptom in Tests:
  “FAIL […] should process basic import” and “should handle nested imports” → “Import file not found: [module.meld], [inner.meld], etc.”  
• Root Cause:
  Your new PathService enforces “Paths with slashes must start with $. or $~,” but the tests still use old unprefixed paths like “module.meld,” “inner.meld,” “b.meld.” Thus the imports are rejected.  
• Exact Code Fixes (test side):

In tests such as services/DirectiveService/DirectiveService.test.ts (and any other import tests that expect to succeed), change the import lines to include the required “$.” prefix. For example:
--------------------------------------------------------------------------------
- @import [module.meld]
+ @import [$.module.meld]

- @import [inner.meld]
+ @import [$.inner.meld]

- @import [b.meld]
+ @import [$.b.meld]
--------------------------------------------------------------------------------

This aligns the test fixtures with the enforced path prefix rules (“$.…” or “$~.…”).

────────────────────────────────────────────────────────────────────────

Once you apply these three sets of code edits:

• The “enableTransformation” lookups will no longer crash (fix #1).  
• The DefineDirectiveHandler error test will see its .details.location properly set (fix #2).  
• The import-related tests will find the correct file paths under the new rules (fix #3).  

These three changes directly address the core failures and allow the rest of your suite to run as intended.
