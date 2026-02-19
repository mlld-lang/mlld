# Arithmetic requires spaces — hyphenated identifiers don't conflict

/exe @math(a-val, b-val) = [
  let @sum = @a-val + @b-val
  let @diff = @a-val - @b-val
  => { sum: @sum, diff: @diff }
]

/show @math(10, 3) | @json
