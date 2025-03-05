=== BACKGROUND

====== TARGET UX

@import[docs/UX.md]

====== / end TARGET UX

====== CURRENT ARCHITECTURE

@import[docs/ARCHITECTURE.md]

====== / end CURRENT ARCHITECTURE

====== CURRENT TEST SETUP

@import[dev/arch--tests.md]

====== / end CURRENT TEST SETUP

====== MELD-AST README

@import[../meld-ast/README.md]

====== / end MELD-AST README

====== LLMXML README

@import[../llmxml/README.md]

====== / end LLMXML README

====== MELD-SPEC TYPES 

@cmd[cpai ../meld-spec/src/types/ --stdout

====== / end MELD-SPEC TYPES

====== MELD-AST TYPES 

@cmd[cpai ../meld-ast/src/ast/astTypes.ts --stdout]

====== / end MELD-AST TYPES

====== MELD GRAMMAR 

@cmd[cpai ../meld-ast/src/grammar/meld.pegjs --stdout]

====== / end MELD GRAMMAR

====== CURRENT CODE 

@cmd[cpai core services cli api tests --stdout]

====== / end CURRENT CODE 

=== / end BACKGROUND