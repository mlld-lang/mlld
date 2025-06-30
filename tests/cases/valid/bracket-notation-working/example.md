# Bracket Notation - Working Contexts Test

Test bracket notation in contexts that should already work.

## Test Data Setup

/var @data = {
  "simple-key": "simple-value",
  "nested": {"inner-key": "inner-value"},
  "special-chars": {"key with spaces": "spaced-value"},
  "numbers": {"123": "numeric-key-value"}
}

/var @dynamicKey = "simple-key"

## Function Arguments Context (Should Work)

/exe @eq(@a, @b) = js {return a === b ? "PASS" : `FAIL: expected '${b}' but got '${a}'`}

### Static String Keys in Function Arguments
/show @eq(@data["simple-key"], "simple-value")
/show @eq(@data["nested"]["inner-key"], "inner-value") 
/show @eq(@data["special-chars"]["key with spaces"], "spaced-value")
/show @eq(@data["numbers"]["123"], "numeric-key-value")

### Dynamic Variable Keys in Function Arguments
/show @eq(@data[@dynamicKey], "simple-value")
/show @eq(@data["nested"]["inner-key"], "inner-value")

## Template Interpolation Context (Should Work)

### Static String Keys in Templates
/show `Simple: @data["simple-key"]`
/show `Nested: @data["nested"]["inner-key"]`
/show `Spaced: @data["special-chars"]["key with spaces"]`
/show `Numeric: @data["numbers"]["123"]`

### Dynamic Variable Keys in Templates  
/show `Dynamic: @data[@dynamicKey]`
/show `Nested Dynamic: @data["nested"]["inner-key"]`