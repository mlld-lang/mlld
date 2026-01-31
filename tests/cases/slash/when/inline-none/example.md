## Test none in when blocks

/var @status = "pending"

>> When block with none fallback
/when [
  @status == "active" => show "System is active"
  @status == "error" => show "System error"
  none => show "Unknown status"
]

>> Test with matching condition - none should not execute
/var @mode = "debug"
/when [
  @mode == "debug" => show "Debug mode enabled"
  none => show "Should not appear"
]

>> Test explicit variable assignment with none
/var @level = 0
/when [
  @level > 10 => var @result = "high"
  @level > 5 => var @result = "medium"
  none => var @result = "low"
]
/show @result
