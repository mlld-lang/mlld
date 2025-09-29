# Bracket Notation Comprehensive Test

Test bracket notation across all major contexts to ensure universal support.

## Test Data Setup

/var @data = {
  "simple-key": "simple-value",
  "nested": {"inner-key": "inner-value"},
  "special-chars": {"key with spaces": "spaced-value", "key-with-dashes": "dashed-value"},
  "numbers": {"123": "numeric-key-value"}
}

/var @dynamicKey = "simple-key"
/var @nestedKey = "inner-key"

## 1. Variable Assignment Context (/var)

### Static String Keys
/var @result1 = @data["simple-key"]
/var @result2 = @data["nested"]["inner-key"]
/var @result3 = @data["special-chars"]["key with spaces"]
/var @result4 = @data["numbers"]["123"]

### Dynamic Variable Keys  
/var @result5 = @data[@dynamicKey]
/var @result6 = @data["nested"][@nestedKey]

## 2. Show Directive Context (/show)

### Static String Keys
/show @data["simple-key"]
/show @data["nested"]["inner-key"]
/show @data["special-chars"]["key with spaces"] 
/show @data["numbers"]["123"]

### Dynamic Variable Keys
/show @data[@dynamicKey]
/show @data["nested"][@nestedKey]

## 3. Backtick Template Context

### Static String Keys
/show `Simple: @data["simple-key"]`
/show `Nested: @data["nested"]["inner-key"]`
/show `Spaced: @data["special-chars"]["key with spaces"]`
/show `Numeric: @data["numbers"]["123"]`

### Dynamic Variable Keys  
/show `Dynamic: @data[@dynamicKey]`
/show `Nested Dynamic: @data["nested"][@nestedKey]`

## 4. Executable Arguments Context

/exe @testFunc(@value) = js {return `Received: ${value}`}

### Static String Keys
/show @testFunc(@data["simple-key"])
/show @testFunc(@data["nested"]["inner-key"])
/show @testFunc(@data["special-chars"]["key with spaces"])
/show @testFunc(@data["numbers"]["123"])

### Dynamic Variable Keys
/show @testFunc(@data[@dynamicKey])
/show @testFunc(@data["nested"][@nestedKey])

## 5. Mixed Notation (Dot + Bracket)

/show @data.nested["inner-key"]

## 6. Results Verification

All of the above should output the expected values:
- simple-value (multiple times)
- inner-value (multiple times)  
- spaced-value
- dashed-value
- numeric-key-value
