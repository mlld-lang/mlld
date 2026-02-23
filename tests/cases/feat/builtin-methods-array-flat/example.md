/var @nested = [[1, 2], [3, 4], [5]]
/var @deep = [[[1, 2]], [[3, 4]]]
/var @mixed = [1, [2, 3], [4, [5, 6]]]

/show @nested.flat()
/show @deep.flat(2)
/show @mixed.flat()

/var @items = ["a", "b", "c", "d"]
/show @items.at(0)
/show @items.at(2)
/show @items.at(-1)
/show @items.at(-2)
