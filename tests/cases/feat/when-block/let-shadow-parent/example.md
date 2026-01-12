/var @x = 10
/var @result = when first [
  true => [
    let @x = 20
    => "done"
  ]
  * => "skipped"
]
/show "Result: @result"
/show "Outer x: @x"
