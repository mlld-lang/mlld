/var @items = ["apple", "banana", "cherry", "date"]

# Built-in methods
/show @items.includes("banana")    # true
/show @items.indexOf("cherry")     # 2
/show @items.join(" and ")         # "apple and banana and cherry and date"

# Array slicing
/show @items[0:2]                  # ["apple", "banana"]  
/show @items[1:]                   # ["banana", "cherry", "date"]
/show @items[:-1]                  # ["apple", "banana", "cherry"]