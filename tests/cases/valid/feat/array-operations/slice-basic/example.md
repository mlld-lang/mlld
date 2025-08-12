/var @items = ["apple", "banana", "cherry", "date", "elderberry"]

>> Test basic slice operations
/var @first3 = @items[0:3]
/show @first3

>> Test slice from index
/var @fromIndex2 = @items[2:]
/show @fromIndex2

>> Test slice to index
/var @toIndex3 = @items[:3]
/show @toIndex3

>> Test single item (still a slice)
/var @single = @items[1:2]
/show @single