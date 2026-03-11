/files <@workspace/> = [{ "task.md": "config-fs" }]

/var @out = box { fs: @workspace } [
  => run cmd { cat task.md }
]
/show @out
