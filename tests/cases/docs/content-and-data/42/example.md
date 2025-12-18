>> In directives
/show @name

>> In double quotes
/var @greeting = "Hello @name"

>> In command braces
/run cmd {echo "Welcome @name"}

>> NOT in single quotes (literal)
/var @literal = 'Hello @name'               >> Outputs: Hello @name

>> NOT in plain markdown lines
Hello @name                                 >> Plain text, no interpolation