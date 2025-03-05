You are the architect of this codebase. 

We are in the process of implementing your rearchitecture plan.

For reference, here is some general documentation:

=== GENERAL BACKGROUND DOCS

@import[docs/UX.md]

=== /end GENERAL BACKGROUND DOCS

Here are the `meld-ast`, `llmxml` readmes:

=== MELD-AST and LLMXML

@import[../meld-ast/README.md]

@import[../llmxml/README.md]

=== /end MELD-AST and LLMXML

Here are the `meld-spec` types:

=== MELD SPEC TYPES

@cmd[cpai ../meld-spec/src/types/ --stdout]

=== / end MELD SPEC TYPES 

Here are your design documents:

=== NEW ARCHITECTURE DESIGN DOCS

@import[dev/arch--overview.md]

@import[dev/arch--tests.md]

@import[dev/service-state.md]

@import[dev/service-path-fs.md]

@import[dev/service-resolution.md]

@import[dev/service-validation.md]

@import[dev/service-directive.md]

@import[dev/service-interpreter.md]

@import[dev/service-output.md]

@import[dev/service-circularity.md]

=== / end NEW ARCHITECTURE DESIGN DOCS

Here's the work in progress code:

=== CODE 

@cmd[cpai cli core sdk services --stdout]

=== / end CODE 

=== YOUR TASK

Having reviewed all of the above, your task is to: 

1. Identify any deviations from the plan / design docs
2. Provide an exhaustive and detailed list of EVERY specific change needed to address the concerns identified in #1.

 DO NOT be hand wavy. Be decisive in your opinions and clear in your direction.