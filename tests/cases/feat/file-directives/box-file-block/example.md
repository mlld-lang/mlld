/var @out = box with { tools: "*" } [
  file "task.md" = "workspace-note"
  let @result = run cmd { cat @root/task.md }
  => @result
]
/show @out
