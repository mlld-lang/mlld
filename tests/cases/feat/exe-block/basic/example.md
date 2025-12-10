# Exe block basics

/exe @greet(name) = [
  let @greeting = "Hello"
  let @punctuation = "!"
  => "@greeting @name@punctuation"
]

/show @greet("World")
