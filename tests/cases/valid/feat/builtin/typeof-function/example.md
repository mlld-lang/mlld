# Testing @typeof() built-in function

Test the @typeof() function with various variable types.

## Simple Text Variable

/var @text = 'Hello, world!'
/show @typeof(@text)

## Number Variable

/var @num = 42
/show @typeof(@num)

## Object Variable

/var @user = {
  name: "Alice",
  age: 30
}
/show @typeof(@user)

## Array Variable

/var @colors = ["red", "green", "blue"]
/show @typeof(@colors)