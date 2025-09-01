/var @seeds = ["a", "b"]

/exe @left(input) = `L:@input`
/exe @right(input) = `R:@input`
/exe @id(input) = js { return input }

/exe @validate() = when first [
  @ctx.try < 3 => retry
  * => `ok @input try=@ctx.try`
]

/for @seed in @seeds => show @seed | @id | @left || @right | @validate()
