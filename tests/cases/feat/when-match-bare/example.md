/var @status = "active"

/when @status [
  "active" => show "Status: active"
  "pending" => show "Status: pending"
  * => show "Status: unknown"
]
