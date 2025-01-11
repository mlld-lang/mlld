@import[partials/meld-architect.md]

We want to work to ensure our codebase is able to serve as a well-tested and spec-compliant (`meld-spec`) interpreter for the meld language interpreter.

Here is the current codebase:

=== CODEBASE ===

@cmd[cpai ../bin ../scripts ../src ../tests ../package.json ../tsconfig.json ../vitest.config.ts --stdout]

=== END CODEBASE ===

=== YOUR TASK ===

Carefully review the current code. Consider that this is a first version which has not yet been released, but also that we want to provide a solid foundation for first users and long-term maintainability.

Assess the strengths and weaknesses of the codebase, including attention to identify bugs, inconsistencies, glaring holes, and missing test coverage.

BE SPECIFIC AND DECISIVE. DO NOT PROVIDE ANYTHING HAND-WAVY OR GENERAL.