# Goal: Analyze Test File for {{ item.name }} for AST Changes

## Context
The AST structure has been simplified. Key changes:
1.  Removed `structured` property from nodes. Tests creating/mocking nodes should use `values` array instead.
2.  Removed `command` property from nodes. Tests creating/mocking nodes should use `raw` property or `values` array instead.
3.  The `values` array now holds parsed node structures (like `VariableReferenceNode`, `TextNode`, etc.). Tests asserting on node structure need to check `values`.
4.  The `raw` property should consistently represent the raw string content relevant to the directive. Test assertions should check `raw`.

# Relevant Fixture (Specific to {{ item.name }})
{{ item.relevantFixtureContent }}

# Test File Content ({{ item.name }})
{{ item.testFileContent }}

## Analysis Request
1.  Carefully review the **Test File Content** provided above.
2.  Reference the **Relevant Fixture** and the **Context** section describing the AST changes.
3.  Identify *every specific line number or code block* in the test file where tests create, mock, or assert against AST node structures or properties (`raw`, `values`, `command`, `structured`, or subtypes within `values`).
4.  For each identified location, determine if a change is needed to align with the new AST structure. Specifically check for:
    *   Creation/mocking/assertion of the removed `command` property.
    *   Creation/mocking/assertion of the removed `structured` property.
    *   Correct assertion against the `raw` property.
    *   Correct creation/mocking/assertion against the `values` array and its contained nodes.
5.  Format your findings as a markdown list below, under a `### Findings` heading:
    *   `* [Line Number(s)]: [Brief Description of Change Needed]`
    *   If no changes are needed, state `* No changes needed.`
    *   If the test file is missing or empty (check `Test File Content`), state `* Test file missing or empty.`

### Findings
