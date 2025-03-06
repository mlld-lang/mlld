@import[partials/meld-architect.md]

You have created a thoughtfully structured plan for addressing some complex issues we have encountered. We are now asking for your help preparing a detailed plan which is written in order to maximize success based on it being carried out by an LLM developer.

We've completed the audit advised for phase 1 (please review below) and we're ready to get your advice on how to proceed with the plan based on this information.

Before you do that, I am going to provide you with some context:

- Architecture documentation (slightly outdated)
- Test setup 
- The plan you provided for strategically approaching resolving issues related to generating the final build output
- Current services code and tests
- Specific test failures

Then, below that, I'm going to provide the audit work completed so far.

========== CONTEXT 

=== ARCHITECTURE

@import[../docs/ARCHITECTURE.md]

=== TEST SETUP

@import[../docs/TESTS.md]

=== YOUR PLAN (VERY IMPORTANT CONTEXT)

@import[../dev/PLAN.md]

=== SERVICES CODE AND TESTS

@cmd[cpai services tests --stdout]

=== END CODE

=== TEST FAILURES

@import[audit/tests.md]

=== END TEST FAILURES

========== END CONTEXT

======= AUDIT WORK COMPLETED

@import[audit/summary.md]

======= END AUDIT WORK COMPLETED

======= YOUR TASK

Provide your analysis of the information gathered thus far.

Consider designing a long-term approach to state instrumentation that sets us up for better debugging overall. If you agree this would be useful, describe the steps for building this state instrumentation system in detail.

Advise on how we should proceed with your original plan based on this new information.
