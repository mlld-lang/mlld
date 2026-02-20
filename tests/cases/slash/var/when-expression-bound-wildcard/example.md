---
description: /var assignment with bound-value when and wildcard fallback
---

/var @status = "unknown"
/var @result = when @status [
  "ok" => "OK"
  "error" => "FAIL"
  * => "DEFAULT"
]

/show @result
