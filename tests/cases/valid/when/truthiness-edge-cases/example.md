# When Truthiness Edge Cases

Test comprehensive truthiness behavior in @when directives.

## 1. Simple @when Truthiness Tests

/text @isEnabled = "true"
/text @isDisabled = "false"
/data @hasFeature = true
/data @noFeature = false
/text @emptyString = ""
/data @nullValue = null
/data @zeroNumber = 0

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

/text @hasLicense = "false"
/data @isValid = false
/data @nothing = null
/text @empty = ""
/data @zero = 0

>> Negating falsy values should trigger
/when !@hasLicense => @add "No license (string 'false')"

/when !@isValid => @add "Not valid (boolean false)"

/when !@nothing => @add "Not null"

/when !@empty => @add "Not empty"

/when !@zero => @add "Not zero"

## 3. Switch with String/Boolean Equivalence

/text @mode = "true"

/when @mode: [
true => @add "Matched as boolean true"
false => @add "Matched as boolean false"
  "production" => @add "Matched production"
]

## 4. Number/String Equivalence in Switch

/data @count = 42
/text @version = "1"

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

/exec @isReady() = [["true"]]
/exec @isEmpty() = [["false"]]
/exec @getNull() = [[]]
/exec @getZero() = [["0"]]

>> String "true" from exec should be truthy
/when @isReady() => @add "System is ready"

>> String "false" from exec should be falsy
/when @isEmpty() => @add "FAIL: false string triggered"

>> Empty string should be falsy
/when @getNull() => @add "FAIL: empty triggered"

>> String "0" should be falsy
/when @getZero() => @add "FAIL: zero string triggered"

## 6. Complex Truthiness in Switches

/data @userResponse = "yes"
/text @permission = ""
/data @score = 0

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

/text @hasTests = "false"
/data @hasDocs = null
/text @hasExamples = "true"

>> At least one truthy value should trigger
/when any: [
  @hasTests
  @hasDocs
  @hasExamples
] => @add "Has at least one artifact"

>> All falsy should not trigger
/text @a = ""
/data @b = 0
/data @c = false

/when any: [
  @a
  @b
  @c
] => @add "FAIL: All falsy triggered any"

## 8. @when all: Block with Mixed Values

/text @allValid = "true"
/data @allSecure = true
/text @allReady = "yes"

>> All truthy should trigger
/when all: [
  @allValid
  @allSecure
  @allReady
] => @add "All checks passed"

>> One falsy should prevent trigger
/text @check1 = "true"
/data @check2 = false
/text @check3 = "true"

/when all: [
  @check1
  @check2
  @check3
] => @add "FAIL: Not all truthy but triggered"

## 9. @when first: with Truthiness

/data @firstStatus = null
/text @firstFallback = ""
/text @firstDefault = "active"

>> Should find first truthy
/when first: [
  @firstStatus => @add "Status: {{firstStatus}}"
  @firstFallback => @add "Fallback: {{firstFallback}}"
  @firstDefault => @add "Default: {{firstDefault}}"
true => @add "Ultimate fallback"
]

## 10. Negation in Block Forms

/text @hasError = ""
/data @hasWarning = false
/text @hasInfo = "false"

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

/text @feature1 = "true"
/data @feature2 = false
/text @feature3 = ""

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

/exec @getFalsy() = js {
  // Return various falsy values
return "";
}

/exec @getStringFalse() = js {
return "false";
}

/exec @getStringZero() = js {
return "0";
}

/when @getFalsy() => @add "FAIL: Empty from JS triggered"
/when @getStringFalse() => @add "FAIL: 'false' from JS triggered"
/when @getStringZero() => @add "FAIL: '0' from JS triggered"