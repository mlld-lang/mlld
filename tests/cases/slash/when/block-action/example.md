/var @condition1 = true
/var @condition2 = true
/var @condition3 = true

## When block - executes first match
/when [
  @condition1 => show "First condition matched"
  @condition2 => show "Second condition matched"
  @condition3 => show "Third condition matched"
]

## Test multiple none conditions in when block
/var @value = 42

>> None of these conditions match, so the first none executes
/when [
  @value < 10 => show "Less than 10"
  @value > 100 => show "Greater than 100"
  @value == 0 => show "Zero"
  none => show "First fallback"
  none => show "Second fallback"
]

>> Test with matching condition - none should not execute
/var @value2 = 5
/when [
  @value2 < 10 => show "Small number"
  @value2 > 100 => show "Large number"
  none => show "Should not appear"
]

>> Test mixed conditions with none and explicit variable assignment
/var @status = "unknown"
/when [
  @status == "ok" => show "Success"
  @status == "error" => show "Failed"
  none => var @result = "Unhandled status"
  none => show "Status: unknown"
]
/show @result
