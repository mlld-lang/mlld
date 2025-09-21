/var @items = ["first", "second", "third", "fourth", "last"]

>> Test negative indices
/var @lastTwo = @items[-2:]
/show @lastTwo

/var @allButLast = @items[:-1]
/show @allButLast

/var @middleOnly = @items[1:-1]
/show @middleOnly

>> Test last item with negative index
/var @lastItem = @items[-1:]
/show @lastItem