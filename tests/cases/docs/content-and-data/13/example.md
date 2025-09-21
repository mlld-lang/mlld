/var @items = ["first", "second", "third", "fourth", "last"]

>> Basic slicing
/show @items[0:3]                        >> ["first", "second", "third"]
/show @items[2:]                         >> ["third", "fourth", "last"]
/show @items[:3]                         >> ["first", "second", "third"]

>> Negative indices
/show @items[-2:]                        >> ["fourth", "last"]
/show @items[:-1]                        >> ["first", "second", "third", "fourth"]
/show @items[1:-1]                       >> ["second", "third", "fourth"]