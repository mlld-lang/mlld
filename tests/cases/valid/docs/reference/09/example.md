/when [
  @score > 90 => show "Excellent!"
  @bonus => show "Bonus applied!"
  none => show "No conditions matched"
]