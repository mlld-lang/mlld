/files <@workspace/> = [{ "task.md": "resolver-shorthand" }]

/var @out = box @workspace [
  => run cmd { cat @root/task.md }
]
/show @out
