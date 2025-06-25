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

## 3. Variable Comparison (NOT a switch - bare when)

Matched as boolean true
## 4. Number/String Variable Comparison

Count is 42
Version 1
## 5. Exec Function String Results

System is ready

## 6. Variable Comparison with Multiple Conditions

User agreed
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