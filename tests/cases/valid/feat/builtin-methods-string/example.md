/var @text = "Hello World"
/var @phrase = "  JavaScript rocks!  "
/var @empty = ""

# String includes method
/show @text.includes("World")
/show @text.includes("world")
/show @empty.includes("test")

# String indexOf method
/show @text.indexOf("W")
/show @text.indexOf("xyz")
/show @phrase.indexOf("Script")

# String length method
/show @text.length()
/show @empty.length()
/show @phrase.length()

# String case methods
/show @text.toLowerCase()
/show @text.toUpperCase()

# String trim method
/show @phrase.trim()

# String startsWith/endsWith methods
/show @text.startsWith("Hello")
/show @text.startsWith("Hi")
/show @text.endsWith("World")
/show @text.endsWith("Earth")

# String split method
/show @text.split(" ")
/show @text.split("")