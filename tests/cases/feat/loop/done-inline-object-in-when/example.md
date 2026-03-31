/var @result = loop(10) [
  let @count = (@input ?? 0) + 1
  when @count >= 3 => [
    let @answer = "finished"
    done { result: @answer, count: @count }
  ]
  continue @count
]
/show @result.result
/show @result.count
