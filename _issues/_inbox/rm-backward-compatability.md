## Problem

We have some 'helpers' that are making our tests lie to us about our test coverage by transforming our test expectations to be old syntax. 

We would like to systematically unwind this and make sure that the syntax tested in our codebase is solely what's in our centralized syntax constants.

We should do this by one type of syntax at a time and getting those tests passing rather than donig it all at once.

## Specific instances 

Running `./scripts/find-backward-compatibility-usage.js` will produce an updated version of this list:

==== BACKWARD COMPATIBILITY USAGE REPORT ====

# DATA DIRECTIVES:

## data.combinations.nestedObject
api/integration.test.ts:155

## data.invalid.
api/integration.test.ts:668

# DEFINE DIRECTIVES:

## define.atomic.simpleCommand
api/integration.test.ts:38
api/integration.test.ts:468

# EMBED DIRECTIVES:

## embed.atomic.withSection
api/integration.test.ts:554

# IMPORT DIRECTIVES:

## import.invalid.
api/integration.test.ts:654

# PATH DIRECTIVES:

## path.atomic.projectPath
api/integration.test.ts:35

# RUN DIRECTIVES:

## run.atomic.simple
api/integration.test.ts:156
api/integration.test.ts:37
api/integration.test.ts:445

# TEXT DIRECTIVES:

## text.atomic.simpleString
api/integration.test.ts:113
api/integration.test.ts:154
api/integration.test.ts:34
api/integration.test.ts:359
api/integration.test.ts:685
api/integration.test.ts:721

## text.atomic.subject
api/integration.test.ts:686
api/integration.test.ts:722

## text.atomic.user
api/integration.test.ts:495

## text.atomic.var1
api/integration.test.ts:65

## text.combinations.basicInterpolation
api/integration.test.ts:66

==== SUMMARY ====
Total backward compatibility examples used: 12
Total files affected: 21