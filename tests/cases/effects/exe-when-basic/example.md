# Exe+When Basic Effects Test

Testing that effects emit correctly in exe+when combinations

/exe @check(value) = when first [
  @value > 5 => show "High: @value"
  @value <= 5 => show "Low: @value"
]

/run @check(10)
/run @check(3)
/show "Complete"