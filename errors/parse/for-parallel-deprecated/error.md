Use `parallel(cap, pacing)` instead of `(cap, pacing) parallel` in `for` loops.

Example:
`for parallel(3, 1s) @item in @items => show @item`
