## Demonstrating difference between none and wildcard (*)

/var @value = 50

>> Wildcard always matches regardless of other conditions
/when [
  @value < 10 => show "Less than 10"
  @value > 100 => show "Greater than 100"
  * => show "Wildcard always executes"
]

>> None only matches when NO other conditions matched
/when [
  @value < 10 => show "Less than 10" 
  @value > 100 => show "Greater than 100"
  none => show "None: no conditions matched"
]

>> When a condition matches, wildcard still executes but none doesn't
/var @match = 5
/when [
  @match < 10 => show "Matched: less than 10"
  * => show "Wildcard: still executes"
]

/when [
  @match < 10 => show "Matched: less than 10"
  none => show "None: should not appear"
]

>> In exe context with first modifier
/exe @classify(val) = when first [
  @val < 0 => "negative"
  @val == 0 => "zero"
  * => "wildcard catches all"
]

/exe @classify2(val) = when first [
  @val < 0 => "negative"
  @val == 0 => "zero"
  none => "none: no match"
]

/show @classify(100)
/show @classify2(100)
/show @classify(-5)
/show @classify2(-5)