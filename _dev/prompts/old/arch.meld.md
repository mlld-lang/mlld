@import[partials/meld-architect.md]

We want to create a thoughtfully structured plan for addressing some complex issues we have encountered. We are now asking for your help preparing a detailed plan which is written in order to maximize success based on it being carried out by an LLM developer.

I am going to provide you with some context:

- Architecture documentation (slightly outdated)
- Test setup 
- Issues we encountered
- Our completed plan to fix these issues
- The subsequent test failures we encountered as we reached the point of finishing that plan
- The advice you provided for strategically approaching resolving these issues

======= CONTEXT 

=== ARCHITECTURE

@import[../docs/ARCHITECTURE.md]

=== TEST SETUP

@import[../docs/TESTS.md]

=== ISSUES ENCOUNTERED

@import[../dev/ISSUES.md]

=== COMPLETED PLAN FOR ADDRESSING ISSUES

@import[../dev/PLAN.md]

=== SUBSEQUENT ISSUES ENCOUNTERED

@import[../dev/TESTFAILS.md]

=== YOUR ADVICE (VERY IMPORTANT CONTEXT)

@import[test-answer-6.md]

======= END CONTEXT 

======= YOUR TASK

Consider the plan laid out in your advice. Make improvements to it as you see fit based on deeper reflection on the provided context and goals here.

Deliver a phased plan for implementing the plan laid out in your advice which includes the following:

1. include relevant context necessary to understand the goals and purpose of the work
2. ensure the plan is wholly informed by and complementary to our existing architecture and testing infrastructure
3. ensure the plan covers changes we need to make to existing code, tests, infra, and docs.

The plan should be phased in an incremental way that ensures current tests will continue to pass 

BE SPECIFIC AND DECISIVE. DO NOT PROVIDE ANYTHING HAND-WAVY. YOUR PLAN SHOULD BE BASED SOLELY ON EVIDENCE AND FACTS. DO NOT HALLUCINATE OR GUESS.
