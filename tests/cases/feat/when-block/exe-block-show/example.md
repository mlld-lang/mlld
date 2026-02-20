/var @mode = "active"
/var @result = when [
  @mode == "active" => [
    show "Status: Active"
    => "success"
  ]
  * => "unknown"
]
/show "Result: @result"
