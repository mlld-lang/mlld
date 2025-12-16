/var @score = 85
/var @result = when [
  @score > 90 => [
    let @grade = "A"
    => @grade
  ]
  @score > 80 => [
    let @grade = "B"
    => @grade
  ]
]
/show @result
