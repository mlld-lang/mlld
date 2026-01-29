/exe @collectEvens(numbers) = [
  let @evens = []
  for @num in @numbers [
    when (@num % 2 == 0) => [
      let @evens += [@num]
    ]
  ]
  => @evens
]

/show @collectEvens([1, 2, 3, 4, 5, 6])
