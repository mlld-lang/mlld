/exe @choose(flag) = [
  if @flag [
    => "early"
  ]
  show "late"
  => "final"
]

/show @choose(true)
