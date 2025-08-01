/var @result = when: [
  @x == 1 => "one" << comment  
  @x == 2 => "two"
  true => "other"
]