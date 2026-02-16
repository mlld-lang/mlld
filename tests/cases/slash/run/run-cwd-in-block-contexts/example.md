/var @dir = "/"

/show "top"
/run cmd:@dir { pwd }

/show "if"
/if true [
  run cmd:@dir { pwd }
]

/show "for"
/for @i in [1] [
  run cmd:@dir { pwd }
]

/show "when"
/when true => [
  run cmd:@dir { pwd }
]

/show "nested-if-for"
/if true [
  for @j in [1] [
    run cmd:@dir { pwd }
  ]
]

/show "nested-for-if"
/for @k in [1] [
  if true [
    run cmd:@dir { pwd }
  ]
]
