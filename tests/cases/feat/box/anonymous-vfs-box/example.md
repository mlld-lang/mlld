/var @out = box [
  file "task.md" = "anonymous-vfs"
  let @result = run cmd { cat task.md }
  => @result
]
/show @out
