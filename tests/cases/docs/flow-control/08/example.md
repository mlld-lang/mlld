/exe @format(name) = when [
  let @greeting = "Hello"
  let @punctuation = "!"
  * => "@greeting @name@punctuation"
]

/show @format("World")