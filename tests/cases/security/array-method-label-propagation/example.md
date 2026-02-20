/var secret @items = ["a", "b", "c"]
/var @sliced = @items.slice(0, 2)
/var @concatd = @items.concat(["d"])
/var @reversed = @items.reverse()
/var @reversedFirst = @reversed[0]
/show @sliced.length
/show @concatd.length
/show @reversedFirst
/show @sliced.mx.labels.includes("secret")
/show @concatd.mx.labels.includes("secret")
/show @reversed.mx.labels.includes("secret")
/show @sliced.mx.taint.includes("secret")
/show @concatd.mx.taint.includes("secret")
/show @reversed.mx.taint.includes("secret")
