/var @value = 10

>> Error: none must be the last condition(s) in a when block
/when @value: [
  @value < 5 => show "Small"
  none => show "Fallback"
  @value > 20 => show "Large"
]