/var @step1 = box [
  file "result.txt" = "step1-output"
  let @r = run cmd { cat result.txt }
  => @r
]

/var @step2 = box [
  file "input.txt" = @step1
  let @r = run cmd { cat input.txt }
  => @r
]
/show @step2