/guard @validateOutput after op:exe = when [
  @output.includes("ERROR") => deny "Operation failed"
  * => allow
]

/exe @query() = run { curl api.example.com/status }
/show @query()                             # Blocked if output contains ERROR