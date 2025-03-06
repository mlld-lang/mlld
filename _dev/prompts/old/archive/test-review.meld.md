Meld is a prompt scripting language. You are the architect of this codebase. 

We now need to identify the gaps in our plans 

We are using test-driven development. One highly problematic scenario is when the tests' expectations don't match our target UX or deviate from our types.

Your task is to study the UX and the types then analyze the tests' alignment with these.

For reference, here is our documentation. Pay close attention to how the directives work.

=== GENERAL BACKGROUND DOCS

@import[docs/UX.md]

=== /end GENERAL BACKGROUND DOCS

Here are the `meld-ast`, `llmxml` readmes:

=== MELD-AST and LLMXML

@import[../meld-ast/README.md]

@import[../llmxml/README.md]

=== /end MELD-AST and LLMXML

Here are the `meld-spec`, `meld-ast`, and `llmxml` types:

=== TYPES

@cmd[cpai ../meld-spec/src/types/ --stdout]

@cmd[cpai ../meld-ast/src/ast/astTypes.ts --stdout]

@cmd[cpai ../llmxml/src/types --stdout]

=== / end TYPES 

Here's the original code for this codebase:

=== CURRENT SERVICES CODE 

@cmd[cpai services --stdout]

=== / end CURRENT SERVICES CODE 

=== ARCHITECTURE / TEST SETUP DOCS

@import[dev/arch--overview.md]

@import[dev/arch--tests.md]

=== / end ARCHITECTURE / TEST SETUP DOCS

Service design docs:

=== SERVICE DESIGN DOCS

@import[dev/service-state.md]

@import[dev/service-path-fs.md]

@import[dev/service-resolution.md]

@import[dev/service-validation.md]

@import[dev/service-directive.md]

@import[dev/service-interpreter.md]

@import[dev/service-output.md]

@import[dev/service-circularity.md]

=== / end SERVICE DESIGN DOCS

=== YOUR TASK

Review the tests for our services and critically assess their alignment with the intended UX and the types in meld-spec, meld-ast, and llmxml.

Based on this, write a list of the changes needed to align the tests' expectations and types.

Be explicit and detailed.