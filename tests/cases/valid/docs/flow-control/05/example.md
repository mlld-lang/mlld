/exe @classify(score) = when first [
  @score >= 90 => "A"
  @score >= 80 => "B"
  @score >= 70 => "C"
  * => "F"
]

/var @grade = @classify(85)
/show @grade