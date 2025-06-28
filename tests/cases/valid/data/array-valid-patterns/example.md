# Valid Array Patterns Test

## Setup
/var @greeting = "Hello"
/exe @getTime() = run {echo "12:00 PM"}
/exe @double(x) = js {return x * 2}

## Array with variables and function calls
/var @mixed = [@greeting, @getTime()]
/show `Mixed array: @mixed`

## Array with quoted strings
/var @files = ["file1.md", "file2.md", "path with spaces.txt"]
/show `File names: @files`

## Array with variable and function call with argument
/var @number = 21
/var @computed = [@number, @double(@number)]
/show `Number and double: @computed`

## Nested arrays with file paths (loads file contents)
/var @contents = [[array-valid-patterns-test1.md], [array-valid-patterns-test2.md]]
/show `File contents array: @contents`

## Array with objects
/var @objects = [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]
/show `Objects: @objects`

## Mixed types array
/var @mixedTypes = [@greeting, 42, true, null, ["nested", "array"]]
/show `Mixed types: @mixedTypes`