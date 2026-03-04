/files <@outer/> = [{ "outer.txt": "outer" }]
/files <@inner/> = [{ "inner.txt": "inner" }]

/box @outer [
  let @first = run cmd { cat @root/outer.txt }
  let @middle = box @inner [
    let @innerValue = run cmd { cat @root/inner.txt }
    => @innerValue
  ]
  let @last = run cmd { cat @root/outer.txt }
  show @first
  show @middle
  show @last
]
