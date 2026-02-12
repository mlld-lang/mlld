/var @x = "outer"

/exe @explode() = [
  let @x = "inner"
  => "done"
]

/var @results = for @n in [1, 2, 3] => {
  number: @n,
  status: @explode()
}

/show @results
