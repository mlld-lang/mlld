## Test when - executes only the first matching condition
/var @env = "production"

/when [
  @env => show "Env has value"
  * => show "Always true"
]

## Test none with first-match semantics
/var @category = "unknown"

>> First-match semantics stop at first match (including none)
/when [
  @category == "food" => show "Food category"
  @category == "tech" => show "Technology category"
  @category == "books" => show "Books category"
  none => show "Unknown category"
  none => show "This should not execute"
]

>> Test where regular condition matches
/var @type = "valid"
/when [
  @type == "valid" => show "Valid type"
  @type == "invalid" => show "Invalid type"
  none => show "Should not appear"
]

>> Test where no conditions match, only first none executes
/var @code = 999
/when [
  @code == 200 => show "OK"
  @code == 404 => show "Not Found"
  @code == 500 => show "Server Error"
  none => var @message = "Unknown code"
  none => var @message = "This won't execute"
]
/show @message
