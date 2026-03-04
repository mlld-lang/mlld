/files <@workspace/> = [{ "task.md": "config-fs" }]

/var @out = box { fs: @workspace } [
  => run cmd { cat @root/task.md }
]
/show @out
