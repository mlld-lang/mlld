# When Truthiness Edge Cases

Test comprehensive truthiness behavior in @when directives.

## 1. Simple @when Truthiness Tests

/var @isEnabled = "true"
/var @isDisabled = "false"
/var @hasFeature = true
/var @noFeature = false
/var @emptyString = ""
/var @nullValue = null
/var @zeroNumber = 0

>> Truthy values should trigger
/when @isEnabled => show "String 'true' is truthy"

/when @hasFeature => show "Boolean true is truthy"

>> Falsy values should NOT trigger
/when @isDisabled => show "FAIL: String 'false' triggered"
/when @noFeature => show "FAIL: Boolean false triggered"
/when @emptyString => show "FAIL: Empty string triggered"
/when @nullValue => show "FAIL: Null triggered"
/when @zeroNumber => show "FAIL: Zero triggered"

## 2. Negation Tests

/var @hasLicense = "false"
/var @isValid = false
/var @nothing = null
/var @empty = ""
/var @zero = 0

>> Negating falsy values should trigger
/when !@hasLicense => show "No license (string 'false')"

/when !@isValid => show "Not valid (boolean false)"

/when !@nothing => show "Not null"

/when !@empty => show "Not empty"

/when !@zero => show "Not zero"

## 3. Switch with String/Boolean Equivalence

/var @mode = "true"

/when @mode: [
true => show "Matched as boolean true"
false => show "Matched as boolean false"
  "production" => show "Matched production"
]

## 4. Number/String Equivalence in Switch

/var @count = 42
/var @version = "1"

>> Numbers and strings should match
/when @count: [
  "42" => show "Count is 42"
  "100" => show "Count is 100"
]

/when @version: [
  "1" => show "Version 1"
  "2" => show "Version 2"
]

## 5. Exec Function String Results

/exe @isReady() = [["true"]]
/exe @isEmpty() = [["false"]]
/exe @getNull() = [[]]
/exe @getZero() = [["0"]]

>> String "true" from exec should be truthy
/when @isReady() => show "System is ready"

>> String "false" from exec should be falsy
/when @isEmpty() => show "FAIL: false string triggered"

>> Empty string should be falsy
/when @getNull() => show "FAIL: empty triggered"

>> String "0" should be falsy
/when @getZero() => show "FAIL: zero string triggered"

## 6. Complex Truthiness in Switches

/var @userResponse = "yes"
/var @permission = ""
/var @score = 0

/when @userResponse: [
  "yes" => show "User agreed"
  "no" => show "User declined"
true => show "Truthy response"
]

>> Empty string and zero shouldn't match true
/when @permission: [
true => show "FAIL: empty matched true"
false => show "No permission"
]

/when @score: [
true => show "FAIL: zero matched true"
false => show "No score"
]

## 7. @when any: Block with Mixed Truthiness

/var @hasTests = "false"
/var @hasDocs = null
/var @hasExamples = "true"

>> At least one truthy value should trigger
/when any: [
  @hasTests
  @hasDocs
  @hasExamples
] => show "Has at least one artifact"

>> All falsy should not trigger
/var @a = ""
/var @b = 0
/var @c = false

/when any: [
  @a
  @b
  @c
] => show "FAIL: All falsy triggered any"

## 8. @when all: Block with Mixed Values

/var @allValid = "true"
/var @allSecure = true
/var @allReady = "yes"

>> All truthy should trigger
/when all: [
  @allValid
  @allSecure
  @allReady
] => show "All checks passed"

>> One falsy should prevent trigger
/var @check1 = "true"
/var @check2 = false
/var @check3 = "true"

/when all: [
  @check1
  @check2
  @check3
] => show "FAIL: Not all truthy but triggered"

## 9. @when first: with Truthiness

/var @firstStatus = null
/var @firstFallback = ""
/var @firstDefault = "active"

>> Should find first truthy
/when first: [
  @firstStatus => show "Status: {{firstStatus}}"
  @firstFallback => show "Fallback: {{firstFallback}}"
  @firstDefault => show "Default: {{firstDefault}}"
true => show "Ultimate fallback"
]

## 10. Negation in Block Forms

/var @hasError = ""
/var @hasWarning = false
/var @hasInfo = "false"

>> Negated conditions in any block
/when any: [
  !@hasError
  !@hasWarning
  !@hasInfo
] => show "At least one log level is clean"

>> Negated in all block
/when all: [
  !@hasError
  !@hasWarning
  !@hasInfo
] => show "All log levels are clean"

## 11. Edge Cases with Empty Arrays

>> What happens with empty condition arrays?
>> These might need special handling or error messages

## 12. Mixed Negation in Same Block

/var @feature1 = "true"
/var @feature2 = false
/var @feature3 = ""

/when any: [
  @feature1
  !@feature2
  @feature3
] => show "Mixed negation: any triggered"

/when all: [
  @feature1
  !@feature2
  !@feature3
] => show "Mixed negation: all triggered"

## 13. Deeply Falsy Values

/exe @getFalsy() = js {
  // Return various falsy values
return "";
}

/exe @getStringFalse() = js {
return "false";
}

/exe @getStringZero() = js {
return "0";
}

/when @getFalsy() => show "FAIL: Empty from JS triggered"
/when @getStringFalse() => show "FAIL: 'false' from JS triggered"
/when @getStringZero() => show "FAIL: '0' from JS triggered"