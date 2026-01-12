/var @result = loop(5) until @input >= 3 [
  let @next = (@input ?? 0) + 1
  when @next == 2 [
    show "matched!"
  ]
  continue @next
]
/show "done"
