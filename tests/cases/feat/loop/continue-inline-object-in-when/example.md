/var @result = loop(10) [
  let @count = (@input.count ?? 0) + 1
  when @count >= 3 => done @input
  let @label = `step-@count`
  continue { count: @count, label: @label }
]
/show @result.count
/show @result.label
