/var @items = ["  beta  ", " alpha "]

/var @whole = @items | @trim
/var @each = for @item in @items => @item | @trim | @upper

/show @whole
/show @each
