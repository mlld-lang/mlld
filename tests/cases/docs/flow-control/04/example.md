/var @score = 95
/when [
  @score > 90 => show "Excellent!"
  @score > 80 => show "Above average!"
  @score == 95 => show "Perfect score!"
]