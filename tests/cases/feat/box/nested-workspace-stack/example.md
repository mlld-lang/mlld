/files <@outer/> = [{ "outer.txt": "outer" }]
/files <@inner/> = [{ "inner.txt": "inner" }]

/box @outer [
  let @first = run cmd { cat outer.txt }
  let @middle = box @inner [
    let @innerValue = run cmd { cat inner.txt }
    => @innerValue
  ]
  let @last = run cmd { cat outer.txt }
  show @first
  show @middle
  show @last
]
