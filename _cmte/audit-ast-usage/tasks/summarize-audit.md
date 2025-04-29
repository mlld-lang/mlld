# Goal: Summarize AST Audit Findings

# Implementation Findings (Array from previous steps)
{{ implementationFindings }}

# Test Findings (Array from previous steps)
{{ testFindings }}

## Analysis Request
1.  Review the **Implementation Findings** and **Test Findings** provided above. These are arrays containing the markdown list outputs from the analysis of each individual component.
2.  Consolidate all the findings into a single, coherent markdown report.
3.  Structure the report by component name. For each component:
    *   List the findings for its implementation file.
    *   List the findings for its test file.
4.  Remove any redundant "No changes needed" entries if there *are* changes listed for a component. If *both* implementation and tests for a component require no changes, you can optionally omit the component or explicitly state "No changes needed for [Component Name]".
5.  Ensure the final output is well-formatted markdown.

## Consolidated Audit Summary
