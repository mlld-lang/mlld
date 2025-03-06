@import[partials/meld-architect.md]

In the course of building this project, we encountered some challenges with our DirectiveService, StateService, OutputService centered around the complexity of state tracking.

@import[partials/state-issues.md]

Our current task is to review the work performed in the audit and create a detailed punchlist of the changes required to the current codebase.

======= AUDIT

@import[audit/summary.md]

======= END AUDIT

======= SERVICES CODE AND TESTS

@cmd[cpai ../services/StateService ../services/DirectiveService ../services/OutputService --stdout]

======= END SERVICES CODE AND TESTS

======= YOUR TASK

Deliver a complete punch list of every change required. 

It is not necessary to write the code, just create an exhaustive and detailed list of the changes required to each file in order to ensure the code and tests are aligned based on the deficiencies identified in the audit.

BE SPECIFIC AND DECISIVE. DO NOT PROVIDE ANYTHING HAND-WAVY. DO NOT HALLUCINATE OR GUESS.