/var @value = 10

>> Error: none after wildcard (*) can never execute
/when @value: [
  @value < 5 => show "Small"
  * => show "Always matches"
  none => show "Never executes"
]