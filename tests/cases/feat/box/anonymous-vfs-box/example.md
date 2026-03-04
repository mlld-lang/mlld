/var @out = box [
  file "task.md" = "anonymous-vfs"
  let @result = run cmd { cat @root/task.md }
  => @result
]
/show @out
