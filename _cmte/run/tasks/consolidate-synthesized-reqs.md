# Consolidate Synthesized Requirements for '@{{ directiveName }}'

## Context

You are the **System Architect**. Requirements for the `@{{ directiveName }}` directive related to subtypes/parameters, execution/runtime, and validation have been synthesized separately.

**CRITICAL NOTE:** Your goal now is to combine these synthesized notes into a final, pragmatic feature list for the draft specification.

1.  **Overall Architecture:** {{ overallArchitecture }}
2.  **`@{{ directiveName }}` Documentation:** {{ directiveClarityContent }}
3.  **Synthesized Subtype/Parameter Requirements:**

{{ subtype_reqs }}

4.  **Synthesized Execution/Runtime Requirements:**

{{ execution_reqs }}

5.  **Synthesized Validation Requirements:**

{{ validation_reqs }}


---

## Task: Consolidate Final Features Pragmatically

Review the three sets of synthesized requirements provided above.

**Your goal is to combine these into a final, pragmatic list of desired features for the initial type spec draft for `@{{ directiveName }}`.**

*   **Integrate & Prioritize:** Combine the features from the three inputs, prioritizing those with the highest impact and alignment with architectural goals.
*   **Ensure Cohesion:** Make sure the combined features work together logically.
*   **Resolve Final Conflicts:** Address any remaining minor conflicts between the synthesized notes.
*   **Explain Key Decisions:** Briefly document your reasoning for the final selection and prioritization, especially if features mentioned in the inputs were modified or excluded.

**Output Format:** Produce concise notes outlining the *final consolidated* features and key decisions, ready to inform the drafting process. Use a simple bulleted list format.

### FINAL Feature Consolidation Notes for '@{{ directiveName }}' Draft

*   **Feature 1:** (e.g., Final decision on discriminated union structure based on subtype_reqs)
*   **Feature 2:** (e.g., Combined requirements for `CommandDefinition` interface from subtype_reqs and execution_reqs)
*   **Feature 3:** (e.g., Key validation rules to implement from validation_reqs)
*   **Rejected/Deferred Feature:** (Explain final decision)
*   (Continue listing key features for the draft) 