You are an expert at identifying root causes of failing tests.

You've previously provided advice on fixing these tests and each suggestion had valuable insights but none was complete on its own. (The `test-answer-1` (etc) answers referred to in the document below are yours.)

Here's our current analysis of the test failures based on what our devs have uncovered so far. 

We're not confident in this analysis and would appreciate your review of the code, noting that we have failed previously. 

Rather than just guessing at the solution,focus on designing a strategic approach to root out the core of these test failures.

=== ANALYSIS ===

@import[../dev/TESTFAILS.md]

=== END ANALYSIS ===

Here's our test status:

=== TEST STATUS ===

@cmd[npm test]

=== END TEST STATUS ===

Here's our codebase:

=== CODE AND TESTS ===

@cmd[cpai api cli core services tests --stdout]

==== END CODE AND TESTS ===

YOUR TASK:

Acknowledging that our previous attempts to resolve these issues, have failed, step back and take a more analytical approach.

Develop a DEEP strategy for methodically approaching the remaining test failures with an evidence-collecting mindset.

Share as much insight as you can about what is revealed by the failing tests and failing attempts to fix them.

Look hard for **inconsistencies in the passing and failing tests themselves** which may be leading us to ping-pong between states due to incompatible expectations.

In addition to your insight, provide a plan for approaching the test failures in a methodical way based on your strategy.

DO NOT GIVE HAND-WAVY ADVICE. BE EVIDENCE-BASED, EXPLICIT, AND DECISIVE.