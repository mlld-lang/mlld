We should centralize all meld snippets used in tests.

This will ensure we are working with the same examples and allow us to check that we're not setting incorrect syntax expectations somewhere in our tests.

It will also allow us to more easily adapt if syntax changes in the future.

Please review the codebase and make a list of every type of usage of lines of meld.

Then categorize the types of examples needed. 

Then carefully design a plan for implementing the change in line with our current architecture and codebase structure.

The list you made will ultimately serve as a punchlist of places to update based on the new plan.