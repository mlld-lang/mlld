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
/when @isEnabled => @add "String 'true' is truthy"

/when @hasFeature => @add "Boolean true is truthy"

>> Falsy values should NOT trigger
/when @isDisabled => @add "FAIL: String 'false' triggered"
/when @noFeature => @add "FAIL: Boolean false triggered"
/when @emptyString => @add "FAIL: Empty string triggered"
/when @nullValue => @add "FAIL: Null triggered"
/when @zeroNumber => @add "FAIL: Zero triggered"

## 2. Negation Tests

/var @hasLicense = "false"
/var @isValid = false
/var @nothing = null
/var @empty = ""
/var @zero = 0

>> Negating falsy values should trigger
/when !@hasLicense => @add "No license (string 'false')"

/when !@isValid => @add "Not valid (boolean false)"

/when !@nothing => @add "Not null"

/when !@empty => @add "Not empty"

/when !@zero => @add "Not zero"

## 3. Switch with String/Boolean Equivalence

/var @mode = "true"

/when @mode: [
true => @add "Matched as boolean true"
false => @add "Matched as boolean false"
  "production" => @add "Matched production"
]

## 4. Number/String Equivalence in Switch

/var @count = 42
/var @version = "1"

>> Numbers and strings should match
/when @count: [
  "42" => @add "Count is 42"
  "100" => @add "Count is 100"
]

/when @version: [
  "1" => @add "Version 1"
  "2" => @add "Version 2"
]

## 5. Exec Function String Results

/exe @isReady() = [["true"]]
/exe @isEmpty() = [["false"]]
/exe @getNull() = [[]]
/exe @getZero() = [["0"]]

>> String "true" from exec should be truthy
/when @isReady() => @add "System is ready"

>> String "false" from exec should be falsy
/when @isEmpty() => @add "FAIL: false string triggered"

>> Empty string should be falsy
/when @getNull() => @add "FAIL: empty triggered"

>> String "0" should be falsy
/when @getZero() => @add "FAIL: zero string triggered"

## 6. Complex Truthiness in Switches

/var @userResponse = "yes"
/var @permission = ""
/var @score = 0

/when @userResponse: [
  "yes" => @add "User agreed"
  "no" => @add "User declined"
true => @add "Truthy response"
]

>> Empty string and zero shouldn't match true
/when @permission: [
true => @add "FAIL: empty matched true"
false => @add "No permission"
]

/when @score: [
true => @add "FAIL: zero matched true"
false => @add "No score"
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
] => @add "Has at least one artifact"

>> All falsy should not trigger
/var @a = ""
/var @b = 0
/var @c = false

/when any: [
  @a
  @b
  @c
] => @add "FAIL: All falsy triggered any"

## 8. @when all: Block with Mixed Values

/var @allValid = "true"
/var @allSecure = true
/var @allReady = "yes"

>> All truthy should trigger
/when all: [
  @allValid
  @allSecure
  @allReady
] => @add "All checks passed"

>> One falsy should prevent trigger
/var @check1 = "true"
/var @check2 = false
/var @check3 = "true"

/when all: [
  @check1
  @check2
  @check3
] => @add "FAIL: Not all truthy but triggered"

## 9. @when first: with Truthiness

/var @firstStatus = null
/var @firstFallback = ""
/var @firstDefault = "active"

>> Should find first truthy
/when first: [
  @firstStatus => @add "Status: {{firstStatus}}"
  @firstFallback => @add "Fallback: {{firstFallback}}"
  @firstDefault => @add "Default: {{firstDefault}}"
true => @add "Ultimate fallback"
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
] => @add "At least one log level is clean"

>> Negated in all block
/when all: [
  !@hasError
  !@hasWarning
  !@hasInfo
] => @add "All log levels are clean"

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
] => @add "Mixed negation: any triggered"

/when all: [
  @feature1
  !@feature2
  !@feature3
] => @add "Mixed negation: all triggered"

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

/when @getFalsy() => @add "FAIL: Empty from JS triggered"
/when @getStringFalse() => @add "FAIL: 'false' from JS triggered"
/when @getStringZero() => @add "FAIL: '0' from JS triggered"