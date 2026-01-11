/var @result = loop(10) [
  let @count = (@input ?? 0) + 1
  when @count >= 3 => done @count
  continue @count
]

/show @result
