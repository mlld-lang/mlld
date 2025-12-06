/guard @validate after op:exe = when [
  @output.includes("ERROR") => deny "Blocked by after-guard"
  * => allow
]

stream /exe @llm(p) = run { claude "@p" }
/show @llm("test")                         # Error: streaming + after-guards conflict

# Fix: disable streaming for this call
/show @llm("test") with { stream: false }  # Works