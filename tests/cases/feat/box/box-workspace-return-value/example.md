/var @data = "payload"

/files <@box-wrv/> = [{ "task.md": @data }]
/box @box-wrv [
  file "notes.md" = "extra"
  let @t = run cmd { cat task.md }
  let @n = run cmd { cat notes.md }
  show @t
  show @n
]