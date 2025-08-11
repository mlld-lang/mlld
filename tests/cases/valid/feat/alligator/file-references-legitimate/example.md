// Basic File References - Should load files when they contain . * @
/var @content1 = "Content: <alligator-test-file.txt>"
/var @content2 = "JSON data: <alligator-data.json>.name"
/var @content3 = "Markdown: <alligator-readme.md # Installation>"

// With Variables  
/var @filename = "alligator-test-file.txt"
/var @dynamic1 = "Load: <@filename>"

// With Pipes
/var @piped1 = "<alligator-data.json>|@json"

/show @content1
/show @content2
/show @content3
/show @dynamic1
/show @piped1