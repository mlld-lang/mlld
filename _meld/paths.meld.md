---
this doc is a work in progress
meld-ast needs to support paths properly first
---

@import[partials/meld-architect.md]

We're currently trying to complete a full implementation of our target path UX for meld.

Meld has a unique way of handling paths for both security and usability reasons. 
- Relative paths are not allowed (including `/rooted/path/../../somepath`) 
- We allow cwd paths with no slashes, but any path containing a slash must be fully rooted at a program-discernable absolute path in either the home directory or project root. 
- There are two global path variables: `$~` (aka `$HOMEPATH`) and `$.` (aka `$PROJECTPATH`) 
- There is a @path variable creator designed to allow users to define custom paths. (eg `@path docs = "$./docs"` which can later allow users to just write a path as `$docs/`)
- Any paths used in directive parameters (ie anything that contains an unescaped `/` must start with a `$` so it is properly rooted)

Some examples:

@import[../docs/PATHRULES.md]

You can read more about this below.

===============================
=== TARGET UX =================

@import[../docs/UX.md]

===============================
=== ARCHITECTURE ==============

@import[../docs/ARCHITECTURE.md]

===============================
=== PIPELINE ==================

@import[../docs/PIPELINE.md]

===============================

=== RECENT CHANGES ============

@import[../dev/SDK-PLAN.md]

===============================
=== RELEVANT CODE AND TESTS ===

@cmd[repomix --include services/pipeline,services/state,services/resolution,api/api.test.ts,api/index.ts,tests/pipeline,core/types/dependencies.ts,core/utils/serviceValidation.ts,services/pipeline/InterpreterService/InterpreterService.test.ts,services/pipeline/InterpreterService/InterpreterService.transformation.test.ts,core/errors/ServiceInitializationError.ts,core/errors/MeldInterpreterError.ts,tests/utils/debug/StateHistoryService/StateHistoryService.ts,tests/utils/debug/StateTrackingService/StateTrackingService.ts]
@import[../repomix-output.xml]

===============================
=== TEST RESULTS ==============

@cmd[npm test]

===============================
=== YOUR TASK =================

Choose 1-3 of the most fundamental problem to prioritize addressing.

For each chosen problem, please analyze the issue, along with the code and failing test associated.

On a scale of 100, assess your confidence in identifying the root cause and a solution.

If you are highly confident, provide the analysis, the root cause, and the solutions. Be explicit about the atomic changes to the code needed to fix the issue.

If you are below 80% confident, provide a recommended strategy and concrete steps for gathering futher evidence and analysis in order to increase your confidence.

BE DECISIVE AND EXPLICIT. DO NOT BE HANDWAVY OR HALLUCINATE.