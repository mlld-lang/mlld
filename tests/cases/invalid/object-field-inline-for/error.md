for-loops cannot be used directly as object field values

This is not a problem with `when [...]` itself.

Extract the loop first:

  let @failingValue = for @item in @x.items when !@item.ok => @item.id

Then reference that value from the object:

  failing: @failingValue
