Below are three failing test areas that strike at the core of our pipeline and output logic, along with an analysis of root causes and how to fix them. I am very confident (≥90%) about the first two, and moderately confident (~70%) about the third. In each case I’ve spelled out exactly what is happening, why, and what code change is needed to fix it.

────────────────────────────────────────────────────────────────────────
1) Execution Directives Not Showing “[run directive output placeholder]”
────────────────────────────────────────────────────────────────────────

• Failing Tests:
  – api/api.test.ts > SDK Integration Tests > Format Conversion > "should handle execution directives correctly"
  – Also affects "should handle complex meld content with mixed directives", etc.

• Symptom:
  The test expects the final output to contain “[run directive output placeholder]” where a “@run” directive occurs. Instead, the actual output is "test" (or the literal run command text).

• Root Cause (Confidence ~95%):
  In non-transformation mode, the OutputService (or whichever step merges run-directive results) should substitute a placeholder for run directives. But currently, the code is letting the run directive text pass straight through as “test”, or skipping the placeholder logic altogether.

• How to Fix (Atomic Steps):
  1. Open services/pipeline/OutputService/OutputService.ts (or wherever run directives are rendered).  
  2. In the code path that processes directive nodes of kind "run," detect whether state or transformation mode requires a placeholder:  
       if (!state.transformationEnabled) {  
         // Non-transformation mode → produce placeholder
         return "[run directive output placeholder]";
       } else {
         // Transformation mode → produce actual expanded content or run output
         return node.runOutput || "";
       }
  3. Ensure the directive handler sets node.runOutput = realCommandOutput (if any) so we have the correct string in transformation mode.  
  4. Re-run the tests. They should now see the placeholder instead of “test.”  

────────────────────────────────────────────────────────────────────────
2) Pipeline Validation: “this.eventService.on is not a function”
────────────────────────────────────────────────────────────────────────

• Failing Tests:
  – tests/pipeline/pipelineValidation.test.ts (all 8 tests fail with “TypeError: this.eventService.on is not a function”)

• Symptom:
  The pipeline validation tests blow up because some component (e.g. StateHistoryService, StateTracker, etc.) calls this.eventService.on(…) but eventService is not an event emitter. Possibly we’re passing a stub or partial mock instead of the real EventEmitter-based StateEventService.

• Root Cause (Confidence ~90%):
  A mismatch in how the test creates or injects eventService. The code that needs eventService expects an object with .on(…) (i.e., an EventEmitter). Instead, the test is providing a plain object or undefined.

• How to Fix (Atomic Steps):
  1. In services/state/StateEventService/StateEventService.ts, confirm your class either extends EventEmitter or implements an on(...) method. For example:  
       import {EventEmitter} from 'events';  
       export class StateEventService extends EventEmitter { … }
  2. In your pipelineValidation.test.ts (or createTestServices, etc.), ensure you do something like:
       const eventService = new StateEventService();
       // pass that into your createTestServices() or directly into new StateHistoryService(eventService).
  3. Make sure you do not overwrite eventService with a partial mock that lacks on(...).  
  4. Re-run the tests. The pipeline validation should proceed without the “TypeError.”

────────────────────────────────────────────────────────────────────────
3) OutputService Markdown Extra Newlines
────────────────────────────────────────────────────────────────────────

• Failing Tests:
  – services/pipeline/OutputService/OutputService.test.ts:  
      “should convert text nodes to markdown”  
      “expected 'Hello world\n' to be 'Hello world\n\n' // or vice versa”  
      …and similarly for “preserveFormatting” tests.

• Symptom:
  The tests fail because the final string has one extra newline at the end (or occasionally between nodes). For example, the test expects "Hello world\n" but gets "Hello world\n\n".

• Root Cause (Confidence ~70%):
  The OutputService code likely appends an extra “\n” after each directive or text block. We are inadvertently doubling newlines instead of conditionally adding them. Another possibility is that we add a trailing blank line in an attempt to separate blocks, but the tests expect none.

• How to Fix (Atomic Steps):
  1. In OutputService’s “markdown” converter code, locate where we append "\n" or "\n\n".  
  2. Add a small check to prevent double newlines, for example:
       // Pseudocode
       if (lastCharAlreadyNewline) {
         // skip appending an extra \n
       } else {
         output += '\n';
       }
     or simply trim the final result if needed.  
  3. For “preserveFormatting” mode, be sure only to add exactly one newline if the text block does not already end with one.  
  4. Re-test to ensure that the strings match exactly.  

────────────────────────────────────────────────────────────────────────

By applying these fixes in the indicated services (particularly OutputService for 1 & 3, and StateEventService-related classes for 2), the failing tests should pass. The first two are “must-fix” for correct directive placeholders and pipeline service dependency, while the third ensures correct cosmetic/newline behavior in Markdown output.
