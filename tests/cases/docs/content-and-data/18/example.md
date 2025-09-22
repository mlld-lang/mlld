/var @fruits = ["apple", "banana", "cherry"]
/var @numbers = [1, 2, 3, 4, 5]

>> Check if array contains value
/show @fruits.includes("banana")         >> true
/show @fruits.includes("orange")         >> false

>> Find index of value
/show @fruits.indexOf("cherry")          >> 2
/show @fruits.indexOf("missing")         >> -1

>> Get array length
/show @fruits.length()                   >> 3

>> Join array elements
/show @fruits.join(", ")                 >> "apple, banana, cherry"
/show @numbers.join(" | ")               >> "1 | 2 | 3 | 4 | 5"