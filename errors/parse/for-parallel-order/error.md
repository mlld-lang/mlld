Wrong order for parallel syntax. The number must come BEFORE 'parallel'.

Correct syntax:   /for ${CAP} parallel @item in @items => ...
Your syntax:      /for parallel ${CAP} @item in @items => ...

Examples:
  /for 18 parallel @item in @items => show @item
  /for (4, 1s) parallel @item in @items => show @item
  /var @results = for 10 parallel @item in @items => @process(@item)
