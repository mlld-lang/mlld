/files <@box-ifr/> = [{ "a.txt": "alpha" }]
/files <@box-ifr/> = [{ "b.txt": "beta" }]

/box @box-ifr [
  let @a = run cmd { cat a.txt }
  let @b = run cmd { cat b.txt }
  show @a
  show @b
]