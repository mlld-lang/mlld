VariableRedefinition: Interpreter error (variable-redefinition): Variable 'title' is already imported and cannot be redefined locally. Originally defined at ./config.mld:1:1. Consider using import aliases: @import { title as titleImported } from "config.mld" at line 2, column 1 in ./example.md

  ./example.md:2:1
1 | @import { title } from "config.mld"
2 | @text title = "Local Title"
      ^
3 | @add @title

Details:
variableName: title
existingLocation: ./config.mld:1:1
newLocation: ./example.md:2:1
filePath: ./example.md
nodeType: variable-redefinition

💡 Consider using import aliases: @import { title as titleImported } from "config.mld"