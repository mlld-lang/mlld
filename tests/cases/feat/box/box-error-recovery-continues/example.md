/box [
  file "a.txt" = "before"
  file "b.txt" = "added"
  run cmd { false }
  file "c.txt" = "after-fail"
  show "reached-end"
]
