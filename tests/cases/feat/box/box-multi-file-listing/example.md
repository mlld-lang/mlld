/var @result = box [
  file "a.txt" = "first"
  file "b.txt" = "second"
  file "c.txt" = "third"
  let @listing = run cmd { ls . }
  => @listing
]
/show @result