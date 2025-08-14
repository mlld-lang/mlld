## Test none in when blocks

/var @status = "pending"

>> Bare when block with none fallback
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

>> Test implicit variable assignment with none
/var @level = 0
/when [
  @level > 10 => @result = "high"
  @level > 5 => @result = "medium"
  none => @result = "low"
]
/show @result