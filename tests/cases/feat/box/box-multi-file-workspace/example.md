/files <@box-mfw/> = [{ "a.txt": "hello" }, { "b.txt": "world" }]

/box @box-mfw [
  let @a = run cmd { cat a.txt }
  let @b = run cmd { cat b.txt }
  show @a
  show @b
]