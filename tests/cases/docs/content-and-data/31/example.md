/var @text = "Hello World"
/var @phrase = "  JavaScript rocks!  "

>> Check if string contains substring
/show @text.includes("World")            >> true
/show @text.includes("world")            >> false

>> Find substring position
/show @text.indexOf("W")                 >> 6
/show @text.indexOf("xyz")               >> -1

>> Get string length
/show @text.length()                     >> 11

>> Change case
/show @text.toLowerCase()                >> "hello world"
/show @text.toUpperCase()                >> "HELLO WORLD"

>> Trim whitespace
/show @phrase.trim()                     >> "JavaScript rocks!"

>> Check start/end
/show @text.startsWith("Hello")          >> true
/show @text.endsWith("World")            >> true

>> Split into array
/show @text.split(" ")                   >> ["Hello", "World"]
/show @text.split("")                    >> ["H", "e", "l", "l", "o", " ", "W", "o", "r", "l", "d"]