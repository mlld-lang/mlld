/var @greeting = when: [
  @time < 12 => "Good morning"
  @time < 18 => "Good afternoon" >> comment
  true => "Good evening"
]