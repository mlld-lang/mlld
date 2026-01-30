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

## 7. Using || operator for OR logic

Has at least one artifact

## 8. Using && operator for AND logic

All checks passed

## 9. @when: with Truthiness

Default: {{firstDefault}}

## 10. Negation with logical operators

At least one log level is clean

All log levels are clean

## 11. Edge Cases with Empty Arrays

## 12. Mixed Negation with logical operators

Mixed negation: || triggered

Mixed negation: && triggered

## 13. Deeply Falsy Values

