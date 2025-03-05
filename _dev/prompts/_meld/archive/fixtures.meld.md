Meld is a prompt scripting language. You are the architect of this codebase. 

We are attempting to identify the root cause of test failures.

=== CODE 

@cmd[cpai tests/utils --stdout]

=== / end CODE 

=== TEST RESULTS 

@cmd[npm test tests/utils/__tests__/FixtureManager.test.ts]

=== / end TEST RESULTS

=== YOUR TASK

Critically review the test failures and related code

Assess the root cause of the failures and provide either 

- steps to gather more information
- the atomic fix required to fix the test failures

Be explicit and detailed. Do NOT be hand wavy or give "advice" -- this is your codebase. Help us fix it.