VariableRedefinition: Interpreter error (variable-redefinition): Variable 'author' is already defined and cannot be redefined. Originally defined at ./example.md:1:1. Variables in mlld are immutable by design. Use a different variable name or remove one of the definitions. at line 2, column 1 in ./example.md

  ./example.md:2:1
1 | @text author = "First Author"
2 | @text author = "Second Author"
      ^
3 | @add @author

Details:
variableName: author
existingLocation: ./example.md:1:1
newLocation: ./example.md:2:1
filePath: ./example.md
nodeType: variable-redefinition

💡 Variables in mlld are immutable by design. Use a different variable name or remove one of the definitions.