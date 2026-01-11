/var @items = ["a", "b", "c"]
/var @summary = @items.length == 0 ? "No items" : `Found @items.length items`
/show @summary

/var @x = 5
/var @result = @x > 3 ? `big: @x` : `small: @x`
/show @result

/var @y = 2
/var @other = @y > 3 ? `big: @y` : `small: @y`
/show @other
