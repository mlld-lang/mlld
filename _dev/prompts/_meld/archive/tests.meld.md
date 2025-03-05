This codebase and its tests have gone through some refactors.

Please help create a detailed and thoughtful strategy for addressing the issues revealed by the test results.

We're focused on the embed tests.

Here's our current code and tests:

====== CODE AND TESTS

@cmd[cpai src tests --stdout]

====== / end CODE AND TESTS

====== PAST ADVICE 

@import[dev/PLAN.md]

====== / end PAST ADVICE

====== MOCKS STRATEGY

@import[dev/MOCKS.md]

====== / end MOCKS STRATEGY

====== TEST RESULTS

@cmd[npm test src/interpreter/directives/__tests__/embed.test.ts]

====== / end TEST RESULTS

====== YOUR TASK

Analyze the current code, tests, and failing tests and advise me on how to proceed strategically and thoughtfully.

DO NOT be hand-wavy. Be specific and decisive. 