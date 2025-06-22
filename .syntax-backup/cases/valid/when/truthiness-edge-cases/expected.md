# When Truthiness Edge Cases

Test comprehensive truthiness behavior in @when directives.

## 1. Simple @when Truthiness Tests

String 'true' is truthy

Boolean true is truthy

## 2. Negation Tests

No license (string 'false')

Not valid (boolean false)

Not null

Not empty

Not zero

## 3. Switch with String/Boolean Equivalence

Matched as boolean true
Matched production
## 4. Number/String Equivalence in Switch

Count is 42
Count is 100
Version 1
Version 2
## 5. Exec Function String Results

System is ready

FAIL: false string triggered

FAIL: zero string triggered

## 6. Complex Truthiness in Switches

User agreed
User declined
Truthy response
FAIL: empty matched true
FAIL: zero matched true
## 7. @when any: Block with Mixed Truthiness

Has at least one artifact

## 8. @when all: Block with Mixed Values

All checks passed

## 9. @when first: with Truthiness

Default: {{firstDefault}}
## 10. Negation in Block Forms

At least one log level is clean

All log levels are clean

## 11. Edge Cases with Empty Arrays

## 12. Mixed Negation in Same Block

Mixed negation: any triggered

Mixed negation: all triggered

## 13. Deeply Falsy Values