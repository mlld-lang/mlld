---
description: Function call with parentheses syntax
---

# Function Call Syntax with Parentheses

/exe @greet(name) = `Hello, @name!`
/exe @makeTitle(name, title) = `@title @name`

## Single parameter
/show @greet('Alice')

## Multiple parameters  
/show @makeTitle('Smith', 'Dr.')

## In template interpolation
/show `Greeting: @greet('Bob')`

## In double-quoted string
/show "Result: @greet('Charlie')"