/var @fruits = ["apple", "banana", "cherry", "date"]
/var @text = "The quick brown fox"

# Variable arguments in methods
/var @searchFruit = "banana"
/var @searchText = "quick"
/var @separator = " -> "
/var @splitChar = " "

# Test with variable arguments
/show @fruits.includes(@searchFruit)
/show @text.includes(@searchText)
/show @fruits.indexOf(@searchFruit)
/show @text.indexOf(@searchText)
/show @fruits.join(@separator)
/show @text.split(@splitChar)

# Edge cases with variables
/var @notFound = "pineapple"
/var @emptyString = ""
/show @fruits.includes(@notFound)
/show @text.split(@emptyString)