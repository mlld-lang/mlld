/var @tools = "json"
/var @empty = ""
/run cmd { echo @tools?`--tools` @empty?`--empty` done }
