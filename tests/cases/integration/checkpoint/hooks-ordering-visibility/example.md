hook @recordBefore before op:exe = [
  append `before | @mx.op.type | @mx.op.name` to "trace.log"
]

hook @recordAfter after op:exe = [
  append `after | @mx.op.type | @mx.op.name` to "trace.log"
]

exe llm @summarize(prompt) = run cmd { claude -p "@prompt" }

var @out = @summarize("summarize this file")
show @out
