/var @result = loop(5) [
  let @next = (@input ?? 0) + 1
  when @next == 2 => [
    show "done-fired"
    done "stop"
  ]
  show `after-when-@next`
  continue @next
]
/show @result
