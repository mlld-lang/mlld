/files <@workspace/> = [{ "task.md": "resolver-shorthand" }]

/var @out = box @workspace [
  => run cmd { cat task.md }
]
/show @out
