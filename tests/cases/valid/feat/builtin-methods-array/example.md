/var @fruits = ["apple", "banana", "cherry"]
/var @numbers = [1, 2, 3, 4, 5]
/var @empty = []

# Array includes method
/show @fruits.includes("banana")
/show @fruits.includes("orange")
/show @numbers.includes(3)
/show @empty.includes("anything")

# Array indexOf method  
/show @fruits.indexOf("cherry")
/show @fruits.indexOf("missing")
/show @numbers.indexOf(1)

# Array length method
/show @fruits.length()
/show @empty.length()

# Array join method
/show @fruits.join(", ")
/show @numbers.join(" | ")
/show @empty.join(",")