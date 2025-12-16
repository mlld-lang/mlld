/var @mode = "active"
/var @result = when first [
  @mode == "active" => [
    show "Status: Active"
    => "success"
  ]
  * => "unknown"
]
/show "Result: @result"
