Unexpected '/${DIRECTIVE}' inside ${BLOCK_TYPE} block. Use '${DIRECTIVE}' without the slash.

Inside [...] blocks, directives don't use the '/' prefix:

  for @item in @items [
    show `Processing: @item`    (not show)
    let @x = @item|upper        (not let)
    => @x
  ]
