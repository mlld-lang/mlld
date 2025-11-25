/guard @validate after op:exe = when [...]  # After guard

stream /exe @llm(p) = run { claude "@p" }
/show @llm("test")                         # Error: streaming + after-guards conflict

# Fix: disable streaming for this call
/show @llm("test") with { stream: false }  # Works