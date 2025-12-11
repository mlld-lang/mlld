# All arithmetic operators

/exe @ops(a, b) = [
  let @sum = @a + @b
  let @diff = @a - @b
  let @product = @a * @b
  let @quotient = @a / @b
  let @remainder = @a % @b
  => { sum: @sum, diff: @diff, product: @product, quotient: @quotient, remainder: @remainder }
]

/show @ops(10, 3) | @json
