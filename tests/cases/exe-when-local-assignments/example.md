/exe @check(input) = when [
  * => [
    let @x = "zzz"
    show "val=@x"
  ]
]

/show "seed" | @check
