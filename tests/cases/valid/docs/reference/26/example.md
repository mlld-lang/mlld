/var @text = "Hello World"
/show @text.includes("World")          # true
/show @text.indexOf("W")               # 6
/show @text.toLowerCase()              # "hello world"
/show @text.toUpperCase()              # "HELLO WORLD"
/show @text.trim()                     # removes whitespace
/show @text.startsWith("Hello")        # true
/show @text.endsWith("World")          # true
/show @text.split(" ")                 # ["Hello", "World"]