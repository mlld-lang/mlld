You are the architect of this codebase. It has gone through some refactors:

- We've fully abstracted out the import and md/xml handling with another library we built called llmxml.
- We've create PathService and centralized our path/fs mocks in testing.

But as we've been revisiting the remaining directives, we've discovered a lot of brittleness to our test configuration and it feels like we still need to do more in order to make our codebase more SOLID, maintainable, readable, and testable.

We are working on designing a new architecture which you have been leading the way on. (I will share this below.)

We are now designing the services for this architecture.

Here's our intended UX:

====== UX

@import[docs/UX.md]

====== / end UX

Here's our current code and tests:

====== CODE AND TESTS

@cmd[cpai src tests --stdout]

====== / end CODE AND TESTS

Here's your design for our new architecture:

====== YOUR ARCHITECTURAL DESIGN

@import[dev/arch--overview.md]

====== / end YOUR ARCHITECTURAL DESIGN

====== YOUR TEST SETUP DESIGN

@import[dev/arch--tests.md]

====== / end YOUR TEST SETUP DESIGN

====== YOUR TASK

You are designing the new **DirectiveService**

Your design should:
- align with, build on, and enhance your architectural design
- adhere strictly to the spec and target UX (double check this!)
- focus first and foremost on isolating and controlling complexity
- reference patterns and libraries that will help us approach this in a well-trod way

Assume:
- we will completely rewrite the directives and their tests
- no sunk cost. this codebase needs NO backward compatibility for anything because we haven't even shipped it yet. we can delete anything and just move forward with a clean approach.
- we should eschew performance for 'working' and maintainability/readability. we need to first make it work and make it clear before we make it fast.

You should deliver a design for this service aligned with target UX and spec which includes:
- structure of the codebase
- ASCII illustrations wherever helpful
- strategy and patterns for isolating complexity
- patterns demonstrating how directives will use the service
- testing strategy for the service aligned with our testing architecture and utilities

The end result of the design should be a critical part of a codebase you are proud of and which aligns with your passion for SOLID, testable, maintainable architecture.

This is YOUR codebase so DO NOT be hand-wavy. Be specific, and decisive in your guidance.